import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[cleanup-r2] Starting daily cleanup...");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const accessKeyId = Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY_ID")!;
  const secretAccessKey = Deno.env.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY")!;
  const endpoint = Deno.env.get("CLOUDFLARE_R2_ENDPOINT")!;
  const bucket = Deno.env.get("CLOUDFLARE_R2_BUCKET_NAME")!;

  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "s3" });

  try {
    // 1. Find error files older than 7 days
    const cutoffDate = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    const { data: staleFiles, error: fetchErr } = await sb
      .from("file_uploads")
      .select("id, company_id, storage_path, file_size, file_name")
      .eq("status", "error")
      .lt("created_at", cutoffDate);

    if (fetchErr) {
      console.error("[cleanup-r2] Error fetching stale files:", fetchErr.message);
      throw fetchErr;
    }

    const filesToClean = staleFiles || [];
    console.log(`[cleanup-r2] Found ${filesToClean.length} error files older than 7 days`);

    let totalDeleted = 0;
    let totalBytesFreed = 0;
    const deletedDetails: { file_name: string; file_size: number | null; company_id: string }[] = [];
    const companiesAffected = new Set<string>();

    for (const file of filesToClean) {
      try {
        // Delete from R2 if storage_path exists
        if (file.storage_path) {
          const url = `${endpoint}/${bucket}/${file.storage_path}`;
          const r2Resp = await aws.fetch(url, { method: "DELETE" });
          if (!r2Resp.ok && r2Resp.status !== 404) {
            console.warn(`[cleanup-r2] R2 delete failed for ${file.storage_path}: ${r2Resp.status}`);
          }
        }

        // Delete extracted data
        await sb.from("file_extracted_data").delete().eq("file_upload_id", file.id);

        // Delete file_uploads record
        const { error: delErr } = await sb.from("file_uploads").delete().eq("id", file.id);
        if (delErr) {
          console.warn(`[cleanup-r2] DB delete failed for ${file.id}: ${delErr.message}`);
          continue;
        }

        totalDeleted++;
        totalBytesFreed += file.file_size || 0;
        companiesAffected.add(file.company_id);
        deletedDetails.push({
          file_name: file.file_name,
          file_size: file.file_size,
          company_id: file.company_id,
        });

        console.log(`[cleanup-r2] Deleted: ${file.file_name} (${file.id})`);
      } catch (err) {
        console.error(`[cleanup-r2] Error cleaning file ${file.id}:`, err);
      }
    }

    // 2. Log results per company
    for (const companyId of companiesAffected) {
      const companyFiles = deletedDetails.filter(d => d.company_id === companyId);
      const companyBytes = companyFiles.reduce((sum, f) => sum + (f.file_size || 0), 0);

      await sb.from("cleanup_logs").insert({
        company_id: companyId,
        files_deleted: companyFiles.length,
        bytes_freed: companyBytes,
        details: {
          files: companyFiles.map(f => f.file_name),
          reason: "error_files_older_than_7_days",
        },
      });
    }

    // If no companies affected but we ran, log a global entry (skip)
    const summary = {
      files_deleted: totalDeleted,
      bytes_freed: totalBytesFreed,
      bytes_freed_mb: (totalBytesFreed / 1024 / 1024).toFixed(2),
      companies_affected: companiesAffected.size,
    };

    console.log(`[cleanup-r2] Cleanup complete:`, JSON.stringify(summary));

    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[cleanup-r2] Fatal error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
