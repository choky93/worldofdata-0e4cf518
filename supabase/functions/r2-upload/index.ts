import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

  const accessKeyId = Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  const endpoint = Deno.env.get("CLOUDFLARE_R2_ENDPOINT");
  const bucket = Deno.env.get("CLOUDFLARE_R2_BUCKET_NAME");

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    return new Response(JSON.stringify({ error: "R2 credentials not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userId = formData.get("userId") as string | null;

    if (!file || !userId) {
      return new Response(JSON.stringify({ error: "Missing file or userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const storagePath = `${userId}/${Date.now()}_${file.name}`;
    const fileBuffer = await file.arrayBuffer();

    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: "s3",
    });

    const url = `${endpoint}/${bucket}/${storagePath}`;

    const r2Response = await aws.fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Length": String(fileBuffer.byteLength),
      },
      body: fileBuffer,
    });

    if (!r2Response.ok) {
      const errorText = await r2Response.text();
      return new Response(JSON.stringify({ error: `R2 upload failed [${r2Response.status}]: ${errorText}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, storagePath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
