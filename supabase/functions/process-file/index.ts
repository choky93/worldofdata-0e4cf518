import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ROWS = 50;
const MAX_CONTENT_CHARS = 12000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB — GPT-4o handles large images well

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

/** RFC 4180 CSV parser — handles BOM, quoted fields, multi-char delimiters */
function parseCSV(text: string): Record<string, unknown>[] {
  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const lines = parseCSVLines(text);
  if (lines.length < 2) return [];

  // Detect delimiter from header line
  const firstLine = lines[0].join('\x00'); // rejoin to detect
  const rawFirst = text.split(/\r?\n/)[0] || '';
  const delimiter = rawFirst.includes('\t') ? '\t' : rawFirst.includes(';') ? ';' : ',';

  // Re-parse with correct delimiter if needed
  const parsed = parseCSVWithDelimiter(text, delimiter);
  if (parsed.length < 2) return [];

  const headers = parsed[0].map(h => h.trim());
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < parsed.length && i <= MAX_ROWS; i++) {
    if (parsed[i].every(v => v.trim() === '')) continue; // skip empty rows
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => { row[h] = parsed[i][j]?.trim() || ''; });
    rows.push(row);
  }
  return rows;
}

function parseCSVLines(text: string): string[][] {
  return parseCSVWithDelimiter(text, ',');
}

/** Parse CSV respecting quoted fields (RFC 4180) */
function parseCSVWithDelimiter(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        current.push(field);
        field = '';
        i++;
      } else if (ch === '\r' || ch === '\n') {
        current.push(field);
        field = '';
        if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
        rows.push(current);
        current = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  if (field || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows.filter(r => r.some(v => v.trim() !== ''));
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
    pdf: 'application/pdf',
  };
  return map[ext] || 'application/octet-stream';
}

/** Call GPT-4o with text and/or vision */
async function extractWithAI(
  content: string,
  fileName: string,
  imageBase64?: string,
  imageMime?: string
): Promise<{ category: string; data: unknown; summary: string; rowCount: number }> {
  const systemPrompt = `Sos un experto en análisis de datos de negocios PyME latinoamericanas.
Analizá el contenido y respondé SIEMPRE en JSON con esta estructura:
{"category":"ventas"|"gastos"|"stock"|"facturas"|"marketing"|"clientes"|"rrhh"|"otro","summary":"Resumen breve 1-2 oraciones","row_count":<número>,"columns":["col1"],"data":[{"col1":"val1"}]}
Reglas:
- Detectá tipo de datos automáticamente
- Extraé hasta 200 filas con todos los datos que puedas
- Normalizá columnas a español minúsculas sin caracteres especiales
- Si es factura/documento individual, poné campos como columnas con un solo registro
- Si hay tablas en imágenes o PDFs, extraé TODOS los datos visibles
- Sé preciso con los números: no redondees ni inventes datos
- Si no podés determinar categoría, usá "otro"`;

  const messages: unknown[] = [{ role: "system", content: systemPrompt }];

  if (imageBase64 && imageMime) {
    const userContent: unknown[] = [
      { type: "text", text: `Analizá este archivo "${fileName}". Extraé TODOS los datos numéricos, tablas, y contenido relevante. Si hay una tabla, extraé todas las filas y columnas.` },
      { type: "image_url", image_url: { url: `data:${imageMime};base64,${imageBase64}`, detail: "high" } },
    ];
    messages.push({ role: "user", content: userContent });
  } else {
    messages.push({
      role: "user",
      content: `Archivo: "${fileName}"\n\nContenido:\n${content.substring(0, MAX_CONTENT_CHARS)}`,
    });
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI error [${resp.status}]: ${errText}`);
  }

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try to salvage broken JSON
    try {
      let cleaned = raw.replace(/,\s*([}\]])/g, '$1');
      const lastBrace = cleaned.lastIndexOf('}');
      if (lastBrace > 0) cleaned = cleaned.substring(0, lastBrace + 1);
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { category: "otro", summary: "No se pudo interpretar la respuesta de IA", columns: [], data: [], row_count: 0 };
    }
  }

  return {
    category: (parsed.category as string) || "otro",
    data: { columns: parsed.columns || [], data: parsed.data || [] },
    summary: (parsed.summary as string) || "Sin resumen",
    rowCount: (parsed.row_count as number) || 0,
  };
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
    const preParsedData = body.preParsedData;

    if (!fileUploadId || !companyId) {
      return new Response(JSON.stringify({ error: "Missing fileUploadId or companyId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: fileRecord, error: fetchErr } = await sb
      .from("file_uploads").select("*").eq("id", fileUploadId).single();
    if (fetchErr || !fileRecord) throw new Error(`File not found: ${fetchErr?.message}`);

    const { file_name, storage_path } = fileRecord;
    const ext = file_name.split('.').pop()?.toLowerCase() || '';

    let content = "";
    let imageBase64: string | undefined;
    let imageMime: string | undefined;

    if (preParsedData) {
      // Excel pre-parsed from frontend
      content = typeof preParsedData === 'string' ? preParsedData : JSON.stringify(preParsedData).substring(0, MAX_CONTENT_CHARS);
    } else {
      if (!storage_path) throw new Error("No storage_path");
      const buffer = await downloadFromR2(storage_path);
      const bytes = new Uint8Array(buffer);

      if (['csv', 'txt'].includes(ext)) {
        const text = new TextDecoder().decode(buffer);
        const rows = parseCSV(text);
        content = JSON.stringify(rows.slice(0, MAX_ROWS));
        if (rows.length > MAX_ROWS) content += `\n(${rows.length} filas totales)`;
      } else if (ext === 'xml') {
        content = new TextDecoder().decode(buffer).substring(0, MAX_CONTENT_CHARS);
      } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
        // Images → GPT-4o vision
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
          content = `[Imagen "${file_name}" demasiado grande (${(buffer.byteLength / 1024).toFixed(0)} KB). Nombre sugiere: ${file_name}]`;
        } else {
          imageBase64 = uint8ToBase64(bytes);
          imageMime = getMimeType(file_name);
        }
      } else if (ext === 'pdf') {
        // PDFs → send as base64 image to GPT-4o vision (reads PDF pages)
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
          // Too large for vision, send filename-based prompt
          content = `[Archivo PDF muy grande - ${(buffer.byteLength / 1024).toFixed(0)} KB. Nombre: "${file_name}". Intentá inferir el tipo de datos por el nombre.]`;
        } else {
          // GPT-4o can read PDF content sent as base64 image
          imageBase64 = uint8ToBase64(bytes);
          imageMime = 'application/pdf';
        }
      } else if (['doc', 'docx'].includes(ext)) {
        try {
          const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
          content = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, MAX_CONTENT_CHARS);
        } catch {
          content = `[Archivo Word - ${(buffer.byteLength / 1024).toFixed(0)} KB. Nombre: ${file_name}]`;
        }
      } else if (['xls', 'xlsx'].includes(ext)) {
        // Excel without pre-parsed data (reprocess case)
        content = `[Archivo Excel - ${(buffer.byteLength / 1024).toFixed(0)} KB. Nombre: "${file_name}". No se pudo parsear en el servidor. Inferí el tipo de datos por el nombre y respondé con category y summary.]`;
      } else {
        content = `[Archivo desconocido: ${ext}. Nombre: "${file_name}". ${(buffer.byteLength / 1024).toFixed(0)} KB]`;
      }
    }

    const result = await extractWithAI(content, file_name, imageBase64, imageMime);

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
