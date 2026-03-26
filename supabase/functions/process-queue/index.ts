import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 5; // Process up to 5 files per invocation

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    // Fetch queued files (oldest first)
    const { data: queuedFiles, error: fetchErr } = await sb
      .from("file_uploads")
      .select("id, company_id, file_name")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw new Error(`Fetch queued files: ${fetchErr.message}`);
    if (!queuedFiles || queuedFiles.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No queued files" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const file of queuedFiles) {
      // Mark as processing
      await sb.from("file_uploads").update({ status: "processing" }).eq("id", file.id);

      try {
        // Call process-file function
        const processResp = await fetch(`${supabaseUrl}/functions/v1/process-file`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            fileUploadId: file.id,
            companyId: file.company_id,
          }),
        });

        if (!processResp.ok) {
          const errText = await processResp.text();
          throw new Error(`process-file returned ${processResp.status}: ${errText}`);
        }

        results.push({ id: file.id, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`process-queue error for ${file.id}:`, msg);
        await sb.from("file_uploads").update({
          status: "error",
          processing_error: msg,
        }).eq("id", file.id);
        results.push({ id: file.id, success: false, error: msg });
      }
    }

    return new Response(JSON.stringify({
      processed: results.length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("process-queue error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
