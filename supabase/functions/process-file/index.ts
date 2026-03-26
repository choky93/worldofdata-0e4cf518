import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CHUNK_ROWS = 500;
const CHUNK_CHARS = 12000;
const MAX_CONTENT_CHARS = 15000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// ─── R2 Download ───────────────────────────────────────────────
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

// ─── CSV Parser (RFC 4180) ─────────────────────────────────────
function parseCSV(text: string): Record<string, unknown>[] {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rawFirst = text.split(/\r?\n/)[0] || '';
  const delimiter = rawFirst.includes('\t') ? '\t' : rawFirst.includes(';') ? ';' : ',';
  const parsed = parseCSVWithDelimiter(text, delimiter);
  if (parsed.length < 2) return [];
  const headers = parsed[0].map(h => h.trim());
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].every(v => v.trim() === '')) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => { row[h] = parsed[i][j]?.trim() || ''; });
    rows.push(row);
  }
  return rows;
}

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
        if (i + 1 < text.length && text[i + 1] === '"') { field += '"'; i += 2; }
        else { inQuotes = false; i++; }
      } else { field += ch; i++; }
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === delimiter) { current.push(field); field = ''; i++; }
      else if (ch === '\r' || ch === '\n') {
        current.push(field); field = '';
        if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
        rows.push(current); current = []; i++;
      } else { field += ch; i++; }
    }
  }
  if (field || current.length > 0) { current.push(field); rows.push(current); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

// ─── Helpers ───────────────────────────────────────────────────
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
  };
  return map[ext] || 'image/png';
}

// ─── PDF Text Extraction ──────────────────────────────────────
async function extractPdfText(buffer: ArrayBuffer): Promise<{ text: string; pages: number; method: string }> {
  try {
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const { text, totalPages } = await extractText(doc, { mergePages: true });
    const cleanText = (typeof text === 'string' ? text : '').trim();
    if (cleanText.length > 50) {
      return { text: cleanText, pages: totalPages, method: 'text_extraction' };
    }
    return { text: cleanText, pages: totalPages, method: 'scanned_minimal_text' };
  } catch (err) {
    console.error('PDF text extraction error:', err);
    return { text: '', pages: 0, method: 'extraction_failed' };
  }
}

// ─── AI Extraction (single chunk) ─────────────────────────────
async function extractWithAI(
  content: string,
  fileName: string,
  imageBase64?: string,
  imageMime?: string,
  metadata?: Record<string, unknown>
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
      { type: "text", text: `Analizá este archivo "${fileName}". Extraé TODOS los datos numéricos, tablas, y contenido relevante.${metadata ? ` Metadata: ${JSON.stringify(metadata)}` : ''}` },
      { type: "image_url", image_url: { url: `data:${imageMime};base64,${imageBase64}`, detail: "high" } },
    ];
    messages.push({ role: "user", content: userContent });
  } else {
    messages.push({
      role: "user",
      content: `Archivo: "${fileName}"\n${metadata ? `Metadata: ${JSON.stringify(metadata)}\n` : ''}\nContenido:\n${content.substring(0, MAX_CONTENT_CHARS)}`,
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

// ─── Chunking helpers ─────────────────────────────────────────
function chunkRows(rows: Record<string, unknown>[], chunkSize: number): Record<string, unknown>[][] {
  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }
  return chunks;
}

function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks;
}

// ─── Process multiple chunks and save ─────────────────────────
async function processChunks(
  sb: ReturnType<typeof createClient>,
  chunks: { content: string; index: number }[],
  fileName: string,
  fileUploadId: string,
  companyId: string,
  metadata: Record<string, unknown>,
): Promise<{ category: string; summary: string; totalRows: number }> {
  let mainCategory = "otro";
  const summaries: string[] = [];
  let totalRows = 0;

  for (const chunk of chunks) {
    const chunkMeta = { ...metadata, chunk_index: chunk.index, total_chunks: chunks.length };
    const result = await extractWithAI(chunk.content, fileName, undefined, undefined, chunkMeta);

    await sb.from("file_extracted_data").insert({
      file_upload_id: fileUploadId,
      company_id: companyId,
      data_category: result.category,
      extracted_json: result.data,
      summary: result.summary,
      row_count: result.rowCount,
      chunk_index: chunk.index,
    });

    if (chunk.index === 0) mainCategory = result.category;
    summaries.push(result.summary);
    totalRows += result.rowCount;
  }

  const combinedSummary = chunks.length === 1
    ? summaries[0]
    : `${summaries[0]} (${chunks.length} bloques procesados, ${totalRows} filas totales)`;

  return { category: mainCategory, summary: combinedSummary, totalRows };
}

// ─── Main Handler ─────────────────────────────────────────────
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

    let processingMetadata: Record<string, unknown> = {};
    let resultInfo: { category: string; summary: string; totalRows: number };

    if (preParsedData) {
      // ─── Excel pre-parsed: check if needs chunking ───
      const content = typeof preParsedData === 'string' ? preParsedData : JSON.stringify(preParsedData);
      processingMetadata = { method: 'client_preparsed', format: 'excel' };

      if (content.length > MAX_CONTENT_CHARS) {
        const textChunks = chunkText(content, CHUNK_CHARS);
        const chunks = textChunks.map((c, i) => ({ content: c, index: i }));
        processingMetadata.chunked = true;
        processingMetadata.total_chunks = chunks.length;
        resultInfo = await processChunks(sb, chunks, file_name, fileUploadId, companyId, processingMetadata);
      } else {
        const result = await extractWithAI(content.substring(0, MAX_CONTENT_CHARS), file_name, undefined, undefined, processingMetadata);
        await sb.from("file_extracted_data").insert({
          file_upload_id: fileUploadId, company_id: companyId,
          data_category: result.category, extracted_json: result.data,
          summary: result.summary, row_count: result.rowCount, chunk_index: 0,
        });
        resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
      }
    } else {
      if (!storage_path) throw new Error("No storage_path");
      const buffer = await downloadFromR2(storage_path);
      const bytes = new Uint8Array(buffer);

      if (['csv', 'txt'].includes(ext)) {
        // ─── CSV/TXT: chunk by rows ───
        const text = new TextDecoder().decode(buffer);
        const allRows = parseCSV(text);
        processingMetadata = { method: 'text_csv_parse', rows_total: allRows.length };

        if (allRows.length > CHUNK_ROWS) {
          const rowChunks = chunkRows(allRows, CHUNK_ROWS);
          processingMetadata.chunked = true;
          processingMetadata.total_chunks = rowChunks.length;
          const chunks = rowChunks.map((rows, i) => ({
            content: JSON.stringify(rows),
            index: i,
          }));
          resultInfo = await processChunks(sb, chunks, file_name, fileUploadId, companyId, processingMetadata);
        } else {
          const content = JSON.stringify(allRows);
          const result = await extractWithAI(content, file_name, undefined, undefined, processingMetadata);
          await sb.from("file_extracted_data").insert({
            file_upload_id: fileUploadId, company_id: companyId,
            data_category: result.category, extracted_json: result.data,
            summary: result.summary, row_count: result.rowCount, chunk_index: 0,
          });
          resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
        }

      } else if (ext === 'xml') {
        const content = new TextDecoder().decode(buffer).substring(0, MAX_CONTENT_CHARS);
        processingMetadata = { method: 'text_raw', format: 'xml', size_kb: Math.round(buffer.byteLength / 1024) };
        const result = await extractWithAI(content, file_name, undefined, undefined, processingMetadata);
        await sb.from("file_extracted_data").insert({
          file_upload_id: fileUploadId, company_id: companyId,
          data_category: result.category, extracted_json: result.data,
          summary: result.summary, row_count: result.rowCount, chunk_index: 0,
        });
        resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };

      } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
        processingMetadata = { method: 'vision', format: ext, size_kb: Math.round(buffer.byteLength / 1024) };
        let imageBase64: string | undefined;
        let imageMime: string | undefined;
        let content = '';

        if (buffer.byteLength > MAX_IMAGE_BYTES) {
          content = `[Imagen "${file_name}" - ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB. Demasiado grande para visión.]`;
          processingMetadata.method = 'image_too_large';
        } else {
          imageBase64 = uint8ToBase64(bytes);
          imageMime = getMimeType(file_name);
        }

        const result = await extractWithAI(content, file_name, imageBase64, imageMime, processingMetadata);
        await sb.from("file_extracted_data").insert({
          file_upload_id: fileUploadId, company_id: companyId,
          data_category: result.category, extracted_json: result.data,
          summary: result.summary, row_count: result.rowCount, chunk_index: 0,
        });
        resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };

      } else if (ext === 'pdf') {
        // ─── PDF: chunk by text length ───
        const pdfResult = await extractPdfText(buffer);
        processingMetadata = { method: pdfResult.method, pages: pdfResult.pages, size_kb: Math.round(buffer.byteLength / 1024) };

        if (pdfResult.method === 'text_extraction' && pdfResult.text.length > 50) {
          const fullText = pdfResult.text;

          if (fullText.length > MAX_CONTENT_CHARS) {
            const textChunks = chunkText(fullText, CHUNK_CHARS);
            processingMetadata.chunked = true;
            processingMetadata.total_chunks = textChunks.length;
            const chunks = textChunks.map((t, i) => ({
              content: `[PDF "${file_name}" - chunk ${i + 1}/${textChunks.length}, ${pdfResult.pages} páginas total]\n\n${t}`,
              index: i,
            }));
            resultInfo = await processChunks(sb, chunks, file_name, fileUploadId, companyId, processingMetadata);
          } else {
            const content = `[PDF con ${pdfResult.pages} páginas, texto extraído]\n\n${fullText}`;
            const result = await extractWithAI(content, file_name, undefined, undefined, processingMetadata);
            await sb.from("file_extracted_data").insert({
              file_upload_id: fileUploadId, company_id: companyId,
              data_category: result.category, extracted_json: result.data,
              summary: result.summary, row_count: result.rowCount, chunk_index: 0,
            });
            resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
          }
        } else {
          // Scanned PDF fallback
          let content: string;
          if (buffer.byteLength <= MAX_IMAGE_BYTES) {
            content = `[PDF escaneado/imagen - ${pdfResult.pages} páginas, ${(buffer.byteLength / 1024).toFixed(0)} KB. Texto parcial: "${pdfResult.text.substring(0, 2000)}". Nombre: "${file_name}".]`;
            processingMetadata.method = 'scanned_pdf_text_fallback';
          } else {
            content = `[PDF muy grande (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB) con poco texto. Texto parcial: "${pdfResult.text.substring(0, 1000)}". Nombre: "${file_name}".]`;
            processingMetadata.method = 'large_scanned_pdf_limited';
          }
          const result = await extractWithAI(content, file_name, undefined, undefined, processingMetadata);
          await sb.from("file_extracted_data").insert({
            file_upload_id: fileUploadId, company_id: companyId,
            data_category: result.category, extracted_json: result.data,
            summary: result.summary, row_count: result.rowCount, chunk_index: 0,
          });
          resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
        }

      } else if (['doc', 'docx'].includes(ext)) {
        let content: string;
        try {
          const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
          content = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, MAX_CONTENT_CHARS);
          processingMetadata = { method: 'text_raw', format: ext };
        } catch {
          content = `[Archivo Word - ${(buffer.byteLength / 1024).toFixed(0)} KB. Nombre: ${file_name}]`;
          processingMetadata = { method: 'word_fallback', format: ext };
        }
        const result = await extractWithAI(content, file_name, undefined, undefined, processingMetadata);
        await sb.from("file_extracted_data").insert({
          file_upload_id: fileUploadId, company_id: companyId,
          data_category: result.category, extracted_json: result.data,
          summary: result.summary, row_count: result.rowCount, chunk_index: 0,
        });
        resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };

    } else if (['xls', 'xlsx'].includes(ext)) {
        // ─── Excel: parse server-side with SheetJS ───
        const wb = XLSX.read(bytes, { type: 'array' });
        const allRows: Record<string, unknown>[] = [];
        const sheetInfo: string[] = [];
        for (const name of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }) as Record<string, unknown>[];
          if (rows.length > 0) {
            sheetInfo.push(`${name}(${rows.length})`);
            allRows.push(...rows);
          }
        }
        processingMetadata = { method: 'server_excel_parse', format: ext, sheets: sheetInfo.join(', '), rows_total: allRows.length };

        if (allRows.length > CHUNK_ROWS) {
          const rowChunks = chunkRows(allRows, CHUNK_ROWS);
          processingMetadata.chunked = true;
          processingMetadata.total_chunks = rowChunks.length;
          const chunks = rowChunks.map((rows, i) => ({
            content: JSON.stringify(rows),
            index: i,
          }));
          resultInfo = await processChunks(sb, chunks, file_name, fileUploadId, companyId, processingMetadata);
        } else {
          const content = JSON.stringify(allRows);
          const result = await extractWithAI(content.substring(0, MAX_CONTENT_CHARS), file_name, undefined, undefined, processingMetadata);
          await sb.from("file_extracted_data").insert({
            file_upload_id: fileUploadId, company_id: companyId,
            data_category: result.category, extracted_json: result.data,
            summary: result.summary, row_count: result.rowCount, chunk_index: 0,
          });
          resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
        }

      } else {
        const content = `[Archivo desconocido: ${ext}. Nombre: "${file_name}". ${(buffer.byteLength / 1024).toFixed(0)} KB]`;
        processingMetadata = { method: 'unknown_format', format: ext };
        const result = await extractWithAI(content, file_name, undefined, undefined, processingMetadata);
        await sb.from("file_extracted_data").insert({
          file_upload_id: fileUploadId, company_id: companyId,
          data_category: result.category, extracted_json: result.data,
          summary: result.summary, row_count: result.rowCount, chunk_index: 0,
        });
        resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
      }
    }

    await sb.from("file_uploads").update({ status: "processed", processing_error: null }).eq("id", fileUploadId);

    return new Response(JSON.stringify({
      success: true,
      category: resultInfo.category,
      summary: resultInfo.summary,
      rowCount: resultInfo.totalRows,
      processingMetadata,
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
