import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ROWS = 30;
const MAX_CONTENT_CHARS = 8000;
const MAX_IMAGE_BYTES = 500 * 1024;

async function downloadFromR2(storagePath: string): Promise<ArrayBuffer> {
  const aws = new AwsClient({
    accessKeyId: Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY")!,
    service: "s3",
  });
  const url = `${Deno.env.get("CLOUDFLARE_R2_ENDPOINT")!}/${Deno.env.get("CLOUDFLARE_R2_BUCKET_NAME")!}/${storagePath}`;
  const resp = await aws.fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error(`R2 download failed [${resp.status}]`);
  return resp.arrayBuffer();
}

function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
  const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => { row[h] = vals[j] || ''; });
    rows.push(row);
  }
  return rows;
}

function safeJsonParse(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw); } catch { /* continue */ }
  try {
    let cleaned = raw.replace(/,\s*([}\]])/g, '$1');
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace > 0) cleaned = cleaned.substring(0, lastBrace + 1);
    return JSON.parse(cleaned);
  } catch { /* continue */ }
  return { category: "otro", summary: "No se pudo interpretar la respuesta de IA", columns: [], data: [], row_count: 0 };
}

async function extractWithAI(
  content: string,
  fileType: string,
  fileName: string,
  isImage: boolean,
  imageBase64?: string
): Promise<{ category: string; data: unknown; summary: string; rowCount: number }> {
  const systemPrompt = `Sos un experto en análisis de datos de negocios PyME latinoamericanas.
Analizá el contenido y respondé SIEMPRE en JSON con esta estructura:
{"category":"ventas"|"gastos"|"stock"|"facturas"|"marketing"|"clientes"|"rrhh"|"otro","summary":"Resumen breve 1-2 oraciones","row_count":<número>,"columns":["col1"],"data":[{"col1":"val1"}]}
Reglas: Detectá tipo de datos. Extraé hasta 200 filas. Normalizá columnas a español minúsculas. Si es factura/documento individual, poné campos como columnas con un registro. Si no podés determinar categoría, usá "otro".`;

  const messages: unknown[] = [{ role: "system", content: systemPrompt }];

  if (isImage && imageBase64) {
    const mimeType = fileName.toLowerCase().endsWith('.png') ? 'image/png' :
                     fileName.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    messages.push({
      role: "user",
      content: [
        { type: "text", text: `Analizá esta imagen "${fileName}". Extraé todos los datos.` },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `Archivo: "${fileName}" (${fileType})\n\nContenido:\n${content.substring(0, MAX_CONTENT_CHARS)}`,
    });
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2048,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI error [${resp.status}]: ${errText}`);
  }

  const data = await resp.json();
  const parsed = safeJsonParse(data.choices[0].message.content);

  return {
    category: (parsed.category as string) || "otro",
    data: { columns: parsed.columns || [], data: parsed.data || [] },
    summary: (parsed.summary as string) || "Sin resumen",
    rowCount: (parsed.row_count as number) || 0,
  };
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let fileUploadId: string | undefined;

  try {
    const body = await req.json();
    fileUploadId = body.fileUploadId;
    const companyId = body.companyId;
    const preParsedData = body.preParsedData; // JSON data pre-parsed from frontend for Excel files

    if (!fileUploadId || !companyId) {
      return new Response(JSON.stringify({ error: "Missing fileUploadId or companyId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: fileRecord, error: fetchErr } = await sb
      .from("file_uploads").select("*").eq("id", fileUploadId).single();
    if (fetchErr || !fileRecord) throw new Error(`File not found: ${fetchErr?.message}`);

    const { file_name, file_type, storage_path } = fileRecord;
    const ext = file_name.split('.').pop()?.toLowerCase() || '';

    let content = "";
    let isImage = false;
    let imageBase64 = "";

    // If we have pre-parsed data from the frontend (Excel files), use it directly
    if (preParsedData) {
      content = typeof preParsedData === 'string' ? preParsedData : JSON.stringify(preParsedData).substring(0, MAX_CONTENT_CHARS);
    } else {
      // Download file from R2 for non-Excel types
      if (!storage_path) throw new Error("No storage_path");
      const buffer = await downloadFromR2(storage_path);

      if (['csv', 'txt'].includes(ext)) {
        const rows = parseCSV(new TextDecoder().decode(buffer));
        content = JSON.stringify(rows.slice(0, MAX_ROWS));
        if (rows.length > MAX_ROWS) content += `\n(${rows.length} filas totales)`;
      } else if (ext === 'xml') {
        content = new TextDecoder().decode(buffer).substring(0, MAX_CONTENT_CHARS);
      } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
          content = `[Imagen "${file_name}" demasiado grande (${(buffer.byteLength / 1024).toFixed(0)} KB). Nombre sugiere: ${file_name}]`;
        } else {
          isImage = true;
          imageBase64 = uint8ToBase64(new Uint8Array(buffer));
        }
      } else if (ext === 'pdf') {
        content = `[Archivo PDF - ${(buffer.byteLength / 1024).toFixed(0)} KB. Nombre: ${file_name}. Inferí el tipo de datos por el nombre y respondé con category y summary.]`;
      } else if (['doc', 'docx'].includes(ext)) {
        try {
          const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
          content = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, MAX_CONTENT_CHARS);
        } catch {
          content = `[Archivo Word - ${(buffer.byteLength / 1024).toFixed(0)} KB. Nombre: ${file_name}]`;
        }
      } else if (['xls', 'xlsx'].includes(ext)) {
        // Fallback: if no pre-parsed data was sent for Excel, send filename-based prompt
        content = `[Archivo Excel - ${(buffer.byteLength / 1024).toFixed(0)} KB. Nombre: ${file_name}. No se pudo parsear. Inferí el tipo de datos por el nombre y respondé con category y summary.]`;
      } else {
        content = `[Archivo desconocido: ${ext}. Nombre: ${file_name}. ${(buffer.byteLength / 1024).toFixed(0)} KB]`;
      }
    }

    const result = await extractWithAI(content, file_type || ext, file_name, isImage, imageBase64);

    const { error: insertErr } = await sb.from("file_extracted_data").insert({
      file_upload_id: fileUploadId,
      company_id: companyId,
      data_category: result.category,
      extracted_json: result.data,
      summary: result.summary,
      row_count: result.rowCount,
    });
    if (insertErr) throw new Error(`Failed to save: ${insertErr.message}`);

    await sb.from("file_uploads").update({ status: "processed", processing_error: null }).eq("id", fileUploadId);

    return new Response(JSON.stringify({
      success: true, category: result.category, summary: result.summary, rowCount: result.rowCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("process-file error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (fileUploadId) {
      try { await sb.from("file_uploads").update({ status: "error", processing_error: msg }).eq("id", fileUploadId); } catch { /* ignore */ }
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
