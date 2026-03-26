import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function detectFileType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "PDF";
  if (ext === "csv") return "CSV";
  if (["xls", "xlsx"].includes(ext)) return "XLS";
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext)) return "Imagen";
  if (["doc", "docx"].includes(ext)) return "Word";
  if (ext === "xml") return "XML";
  return "Otro";
}

function extractFileName(url: string, contentDisposition?: string | null): string {
  // Try content-disposition header first
  if (contentDisposition) {
    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match && match[1]) return match[1].replace(/['"]/g, "").trim();
  }
  // Try URL path
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last.includes(".")) return decodeURIComponent(last);
  } catch { /* ignore */ }
  return `import_${Date.now()}`;
}

function transformGoogleDriveUrl(url: string): string {
  // Convert Google Drive share links to direct download
  const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
  }
  if (url.includes("drive.google.com") && url.includes("id=")) {
    return url.replace(/\/open\?/, "/uc?export=download&");
  }
  return url;
}

function transformDropboxUrl(url: string): string {
  // Convert Dropbox share links to direct download
  if (url.includes("dropbox.com")) {
    return url.replace("dl=0", "dl=1").replace("www.dropbox.com", "dl.dropboxusercontent.com");
  }
  return url;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const { urls, userId, companyId, priority } = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0 || !userId || !companyId) {
      return new Response(JSON.stringify({ error: "Missing urls, userId, or companyId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);
    const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "s3" });

    const results: { url: string; success: boolean; fileUploadId?: string; error?: string }[] = [];

    for (const entry of urls) {
      const rawUrl = typeof entry === "string" ? entry : entry.url;
      const customName = typeof entry === "object" ? entry.name : null;

      try {
        // Transform special URLs
        let downloadUrl = rawUrl.trim();
        downloadUrl = transformGoogleDriveUrl(downloadUrl);
        downloadUrl = transformDropboxUrl(downloadUrl);

        // Download the file
        const resp = await fetch(downloadUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          redirect: "follow",
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const contentDisposition = resp.headers.get("content-disposition");
        const fileName = customName || extractFileName(rawUrl, contentDisposition);
        const fileBuffer = await resp.arrayBuffer();
        const fileSize = fileBuffer.byteLength;

        if (fileSize > 100 * 1024 * 1024) {
          throw new Error("Archivo excede 100MB");
        }

        // Upload to R2
        const storagePath = `${userId}/${Date.now()}_${fileName}`;
        const r2Url = `${endpoint}/${bucket}/${storagePath}`;
        const contentType = resp.headers.get("content-type") || "application/octet-stream";

        const r2Resp = await aws.fetch(r2Url, {
          method: "PUT",
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(fileSize),
          },
          body: fileBuffer,
        });

        if (!r2Resp.ok) throw new Error(`R2 upload failed: ${r2Resp.status}`);

        // Register in DB
        const { data: dbData, error: dbError } = await sb.from("file_uploads").insert({
          file_name: fileName,
          file_type: detectFileType(fileName),
          file_size: fileSize,
          status: "queued",
          storage_path: storagePath,
          uploaded_by: userId,
          company_id: companyId,
          priority: priority ?? -1, // URL imports get low priority by default
        }).select("id").single();

        if (dbError) throw new Error(dbError.message);

        results.push({ url: rawUrl, success: true, fileUploadId: dbData.id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`import-url error for ${rawUrl}:`, msg);
        results.push({ url: rawUrl, success: false, error: msg });
      }
    }

    return new Response(JSON.stringify({
      imported: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
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
