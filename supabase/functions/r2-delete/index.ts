import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AwsClient } from "https://deno.land/x/aws4fetch@v1.0.2/mod.ts";

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
    const { storagePath } = await req.json();

    if (!storagePath) {
      return new Response(JSON.stringify({ error: "Missing storagePath" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: "s3",
    });

    const url = `${endpoint}/${bucket}/${storagePath}`;

    const r2Response = await aws.fetch(url, { method: "DELETE" });

    if (!r2Response.ok && r2Response.status !== 404) {
      const errorText = await r2Response.text();
      return new Response(JSON.stringify({ error: `R2 delete failed [${r2Response.status}]: ${errorText}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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
