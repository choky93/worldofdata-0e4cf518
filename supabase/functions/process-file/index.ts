import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.20";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function downloadFromR2(storagePath: string): Promise<ArrayBuffer> {
  const accessKeyId = Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY_ID")!;
  const secretAccessKey = Deno.env.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY")!;
  const endpoint = Deno.env.get("CLOUDFLARE_R2_ENDPOINT")!;
  const bucket = Deno.env.get("CLOUDFLARE_R2_BUCKET_NAME")!;

  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "s3" });
  const url = `${endpoint}/${bucket}/${storagePath}`;
  const resp = await aws.fetch(url, { method: "GET" });

  if (!resp.ok) {
    throw new Error(`R2 download failed [${resp.status}]: ${await resp.text()}`);
  }
  return resp.arrayBuffer();
}

function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter
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

function parseExcel(buffer: ArrayBuffer): { sheetName: string; rows: Record<string, unknown>[] }[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const results: { sheetName: string; rows: Record<string, unknown>[] }[] = [];

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
    if (rows.length > 0) {
      results.push({ sheetName: name, rows });
    }
  }
  return results;
}

function parseXML(text: string): string {
  // Return raw XML text for AI to interpret
  return text.substring(0, 50000);
}

async function extractWithOpenAI(
  content: string,
  fileType: string,
  fileName: string,
  isImage: boolean,
  imageBase64?: string
): Promise<{ category: string; data: unknown; summary: string; rowCount: number }> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

  const systemPrompt = `Sos un experto en análisis de datos de negocios PyME latinoamericanas. 
Tu tarea es analizar el contenido de un archivo subido y extraer datos estructurados.

Respondé SIEMPRE en JSON con esta estructura exacta:
{
  "category": "ventas" | "gastos" | "stock" | "facturas" | "marketing" | "clientes" | "rrhh" | "otro",
  "summary": "Resumen breve de lo que contiene el archivo (1-2 oraciones)",
  "row_count": <número de registros/filas encontradas>,
  "columns": ["col1", "col2", ...],
  "data": [ {"col1": "val1", "col2": "val2"}, ... ]
}

Reglas:
- Detectá automáticamente qué tipo de datos son (ventas, gastos, inventario, etc.)
- Extraé TODAS las filas de datos, hasta un máximo de 500 filas
- Normalizá nombres de columnas a español, minúsculas, sin caracteres especiales
- Si es una factura o documento individual, poné los campos como columnas y un solo registro
- Si no podés determinar la categoría, usá "otro"
- Si hay montos, intentá detectar la moneda`;

  const messages: any[] = [{ role: "system", content: systemPrompt }];

  if (isImage && imageBase64) {
    const mimeType = fileName.toLowerCase().endsWith('.png') ? 'image/png' :
                     fileName.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    messages.push({
      role: "user",
      content: [
        { type: "text", text: `Analizá esta imagen del archivo "${fileName}". Extraé todos los datos que puedas identificar (tablas, números, texto relevante).` },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `Archivo: "${fileName}" (tipo: ${fileType})\n\nContenido:\n${content.substring(0, 30000)}`,
    });
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
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
  const parsed = JSON.parse(data.choices[0].message.content);

  return {
    category: parsed.category || "otro",
    data: { columns: parsed.columns || [], data: parsed.data || [] },
    summary: parsed.summary || "Sin resumen",
    rowCount: parsed.row_count || 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const { fileUploadId, companyId } = await req.json();

    if (!fileUploadId || !companyId) {
      return new Response(JSON.stringify({ error: "Missing fileUploadId or companyId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the file record
    const { data: fileRecord, error: fetchErr } = await sb
      .from("file_uploads")
      .select("*")
      .eq("id", fileUploadId)
      .single();

    if (fetchErr || !fileRecord) {
      throw new Error(`File not found: ${fetchErr?.message}`);
    }

    const { file_name, file_type, storage_path } = fileRecord;
    if (!storage_path) throw new Error("No storage_path");

    // Download from R2
    const buffer = await downloadFromR2(storage_path);
    const ext = file_name.split('.').pop()?.toLowerCase() || '';

    let content = "";
    let isImage = false;
    let imageBase64 = "";

    if (['csv', 'txt'].includes(ext)) {
      const text = new TextDecoder().decode(buffer);
      const rows = parseCSV(text);
      content = JSON.stringify(rows.slice(0, 100), null, 2);
      if (rows.length > 100) content += `\n... (${rows.length} filas totales)`;
    } else if (['xls', 'xlsx'].includes(ext)) {
      const sheets = parseExcel(buffer);
      content = sheets.map(s => `Hoja "${s.sheetName}" (${s.rows.length} filas):\n${JSON.stringify(s.rows.slice(0, 100), null, 2)}`).join('\n\n');
    } else if (ext === 'xml') {
      content = parseXML(new TextDecoder().decode(buffer));
    } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
      isImage = true;
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      imageBase64 = btoa(binary);
    } else if (ext === 'pdf') {
      // For PDF, send first bytes as base64 image to Vision API for OCR
      isImage = true;
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      imageBase64 = btoa(binary);
      // Override: send as document to text extraction prompt
      isImage = false;
      content = `[Archivo PDF - ${(buffer.byteLength / 1024).toFixed(0)} KB. No se pudo extraer texto directamente. Nombre: ${file_name}. Intentá inferir el tipo de datos por el nombre del archivo y respondé con category y summary básicos.]`;
    } else if (['doc', 'docx'].includes(ext)) {
      // Basic text extraction from docx (ZIP containing XML)
      try {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
        // Extract readable text fragments
        const textContent = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        content = textContent.substring(0, 30000);
      } catch {
        content = `[Archivo Word - ${(buffer.byteLength / 1024).toFixed(0)} KB. Nombre: ${file_name}]`;
      }
    } else {
      content = `[Archivo de tipo desconocido: ${ext}. Nombre: ${file_name}. Tamaño: ${(buffer.byteLength / 1024).toFixed(0)} KB]`;
    }

    // Send to OpenAI for classification and extraction
    const result = await extractWithOpenAI(content, file_type || ext, file_name, isImage, imageBase64);

    // Save extracted data
    const { error: insertErr } = await sb.from("file_extracted_data").insert({
      file_upload_id: fileUploadId,
      company_id: companyId,
      data_category: result.category,
      extracted_json: result.data,
      summary: result.summary,
      row_count: result.rowCount,
    });

    if (insertErr) {
      console.error("Insert error:", insertErr);
      throw new Error(`Failed to save extracted data: ${insertErr.message}`);
    }

    // Update file status to processed
    await sb.from("file_uploads").update({ status: "processed", processing_error: null }).eq("id", fileUploadId);

    return new Response(JSON.stringify({
      success: true,
      category: result.category,
      summary: result.summary,
      rowCount: result.rowCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("process-file error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";

    // Try to update file status to error
    try {
      const { fileUploadId } = await req.clone().json();
      if (fileUploadId) {
        await sb.from("file_uploads").update({ status: "error", processing_error: msg }).eq("id", fileUploadId);
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
