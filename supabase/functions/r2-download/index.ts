import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fileUploadId } = await req.json();
    if (!fileUploadId) {
      return new Response(JSON.stringify({ error: "Missing fileUploadId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get file record — use service role to check ownership via company
    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await sbAdmin.from("profiles").select("company_id").eq("id", user.id).single();
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "No company" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: fileRecord, error: fileErr } = await sbAdmin
      .from("file_uploads")
      .select("storage_path, file_name, company_id")
      .eq("id", fileUploadId)
      .eq("company_id", profile.company_id)
      .single();

    if (fileErr || !fileRecord?.storage_path) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download from R2
    const aws = new AwsClient({
      accessKeyId: Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY")!,
      service: "s3",
    });

    const r2Url = `${Deno.env.get("CLOUDFLARE_R2_ENDPOINT")!}/${Deno.env.get("CLOUDFLARE_R2_BUCKET_NAME")!}/${fileRecord.storage_path}`;
    const r2Resp = await aws.fetch(r2Url, { method: "GET" });

    if (!r2Resp.ok) {
      const errMsg = r2Resp.status === 404 || r2Resp.status === 403
        ? "Archivo no encontrado en storage. Volvé a subir el archivo desde la interfaz."
        : `Error descargando archivo [${r2Resp.status}]`;
      return new Response(JSON.stringify({ error: errMsg }), {
        status: r2Resp.status === 404 ? 404 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileBuffer = await r2Resp.arrayBuffer();
    const ext = fileRecord.file_name.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xml: 'application/xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    };

    return new Response(fileBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": mimeMap[ext] || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileRecord.file_name}"`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
