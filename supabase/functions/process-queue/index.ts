import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 5;
const HEAVY_FILE_THRESHOLD = 1 * 1024 * 1024; // 1MB — files above this are "heavy"
const MAX_HEAVY_PARALLEL = 1; // Only 1 heavy file at a time
const STUCK_THRESHOLD_MINUTES = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    // ─── Step 1: Recover stuck files ───────────────────────────
    const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    const { data: stuckFiles, error: stuckErr } = await sb
      .from("file_uploads")
      .select("id, file_name")
      .eq("status", "processing")
      .lt("processing_started_at", stuckCutoff);

    if (!stuckErr && stuckFiles && stuckFiles.length > 0) {
      console.log(`[process-queue] Recovering ${stuckFiles.length} stuck file(s): ${stuckFiles.map(f => f.file_name).join(', ')}`);
      for (const f of stuckFiles) {
        await sb.from("file_uploads").update({
          status: "queued",
          processing_error: null,
        }).eq("id", f.id).eq("status", "processing");
      }
    }

    // Also recover files stuck without processing_started_at (legacy)
    const { data: legacyStuck } = await sb
      .from("file_uploads")
      .select("id, file_name, created_at")
      .eq("status", "processing")
      .is("processing_started_at", null);

    if (legacyStuck && legacyStuck.length > 0) {
      const cutoff = Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000;
      for (const f of legacyStuck) {
        if (f.created_at && new Date(f.created_at).getTime() < cutoff) {
          console.log(`[process-queue] Recovering legacy stuck file: ${f.file_name}`);
          await sb.from("file_uploads").update({ status: "queued", processing_error: null }).eq("id", f.id);
        }
      }
    }

    // ─── Step 2: Fetch queued files ────────────────────────────
    const { data: queuedFiles, error: fetchErr } = await sb
      .from("file_uploads")
      .select("id, company_id, file_name, next_chunk_index")
      .eq("status", "queued")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw new Error(`Fetch queued files: ${fetchErr.message}`);
    if (!queuedFiles || queuedFiles.length === 0) {
      console.log("[process-queue] No queued files");
      return new Response(JSON.stringify({ processed: 0, message: "No queued files" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[process-queue] Found ${queuedFiles.length} queued file(s): ${queuedFiles.map(f => f.file_name).join(', ')}`);

    // ─── Step 3: Atomic lock ──────────────────────────────────
    const lockedIds: string[] = [];
    const now = new Date().toISOString();
    for (const f of queuedFiles) {
      const { data: updated, error: lockErr } = await sb
        .from("file_uploads")
        .update({ status: "processing", processing_started_at: now })
        .eq("id", f.id)
        .eq("status", "queued")
        .select("id")
        .single();

      if (!lockErr && updated) {
        lockedIds.push(f.id);
      }
    }

    if (lockedIds.length === 0) {
      console.log("[process-queue] No files locked (already taken)");
      return new Response(JSON.stringify({ processed: 0, message: "No files locked (already taken)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const filesToProcess = queuedFiles.filter(f => lockedIds.includes(f.id));
    console.log(`[process-queue] Locked ${filesToProcess.length} file(s) for processing`);

    // ─── Step 4: Process all files in parallel ────────────────
    const settled = await Promise.allSettled(
      filesToProcess.map(async (file) => {
        console.log(`[process-queue] Invoking process-file for "${file.file_name}" (${file.id})`);
        const processResp = await fetch(`${supabaseUrl}/functions/v1/process-file`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            fileUploadId: file.id,
            companyId: file.company_id,
            startChunk: file.next_chunk_index || 0,
          }),
        });

        if (!processResp.ok) {
          const errText = await processResp.text();
          throw new Error(`process-file returned ${processResp.status}: ${errText}`);
        }

        const result = await processResp.json();
        console.log(`[process-queue] process-file result for "${file.file_name}":`, JSON.stringify(result));
        return file.id;
      })
    );

    const results: { id: string; name: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const file = filesToProcess[i];

      if (result.status === "fulfilled") {
        results.push({ id: file.id, name: file.file_name, success: true });
      } else {
        const msg = result.reason instanceof Error ? result.reason.message : "Unknown error";
        console.error(`[process-queue] ❌ Error for "${file.file_name}" (${file.id}):`, msg);
        await sb.from("file_uploads").update({
          status: "error",
          processing_error: msg.substring(0, 500),
        }).eq("id", file.id);
        results.push({ id: file.id, name: file.file_name, success: false, error: msg });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[process-queue] ✅ Done: ${successCount}/${results.length} succeeded`);

    return new Response(JSON.stringify({
      processed: results.length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[process-queue] ❌ Fatal error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
