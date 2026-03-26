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
    const { fileName, userId, contentType } = await req.json();

    if (!fileName || !userId) {
      return new Response(JSON.stringify({ error: "Missing fileName or userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const storagePath = `${userId}/${Date.now()}_${fileName}`;
    const url = `${endpoint}/${bucket}/${storagePath}`;

    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: "s3",
    });

    // Create a presigned PUT request (valid for 1 hour)
    const presignedUrl = await aws.sign(
      new Request(url, {
        method: "PUT",
        headers: {
          "Content-Type": contentType || "application/octet-stream",
        },
      }),
      { aws: { signQuery: true, datetime: new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), allHeaders: true } }
    );

    return new Response(JSON.stringify({
      success: true,
      presignedUrl: presignedUrl.url,
      storagePath,
    }), {
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
