import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5/xlsx.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 500;
const MAX_CONTENT_CHARS = 15000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_EXCEL_ROWS = 50000;
const MAX_EXCEL_FILE_SIZE = 3 * 1024 * 1024;
const CHUNK_CHARS = 12000;
const MAX_CHUNKS_PER_INVOCATION = 2;

// ─── R2 Download ───────────────────────────────────────────────
async function downloadFromR2(storagePath: string): Promise<ArrayBuffer> {
  console.log(`[process-file] Downloading from R2: ${storagePath}`);
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

// ─── Fix Broken Headers (server-side) ─────────────────────────
function fixBrokenHeaders(rows: Record<string, unknown>[]): { rows: Record<string, unknown>[]; headers: string[] } {
  if (rows.length === 0) return { rows, headers: [] };
  const originalHeaders = Object.keys(rows[0]);
  const emptyCount = originalHeaders.filter(h => h.startsWith('__EMPTY') || h.trim() === '').length;
  if (emptyCount / originalHeaders.length < 0.5) {
    // Filter completely empty rows
    const filtered = rows.filter(row => Object.values(row).some(v => String(v ?? '').trim() !== ''));
    return { rows: filtered, headers: originalHeaders };
  }
  console.log(`[process-file] Broken headers detected (${emptyCount}/${originalHeaders.length}). Searching for real header row...`);
  const searchLimit = Math.min(10, rows.length);
  let bestRowIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < searchLimit; i++) {
    const row = rows[i];
    const values = Object.values(row).map(v => String(v ?? '').trim()).filter(v => v !== '');
    const textValues = values.filter(v => isNaN(Number(v.replace(/[.,]/g, ''))));
    if (textValues.length > bestScore) {
      bestScore = textValues.length;
      bestRowIdx = i;
    }
  }
  if (bestRowIdx < 0 || bestScore < 2) {
    return { rows, headers: originalHeaders };
  }
  const headerRow = rows[bestRowIdx];
  const newHeaders = originalHeaders.map(oldKey => {
    const val = String(headerRow[oldKey] ?? '').trim();
    return val || oldKey;
  });
  const dataRows = rows.slice(bestRowIdx + 1);
  const remapped = dataRows.map(row => {
    const newRow: Record<string, unknown> = {};
    originalHeaders.forEach((oldKey, j) => { newRow[newHeaders[j]] = row[oldKey]; });
    return newRow;
  }).filter(row => Object.values(row).some(v => String(v ?? '').trim() !== ''));
  console.log(`[process-file] Fixed headers at row ${bestRowIdx}: ${newHeaders.join(', ')} → ${remapped.length} rows`);
  return { rows: remapped, headers: newHeaders };
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
    console.error('[process-file] PDF text extraction error:', err);
    return { text: '', pages: 0, method: 'extraction_failed' };
  }
}

// ─── AI Classification (lightweight — headers + sample only) ──
async function classifyWithAI(
  headers: string[],
  sampleRows: Record<string, unknown>[],
  fileName: string,
): Promise<{ category: string; summary: string }> {
  console.log(`[process-file] AI classification for "${fileName}" (${headers.length} cols, ${sampleRows.length} sample rows)`);

  const systemPrompt = `Sos un clasificador de datos de negocios PyME latinoamericanas.
Te doy las columnas y unas filas de ejemplo de un archivo. Respondé SOLO en JSON:
{"category":"ventas"|"gastos"|"stock"|"facturas"|"marketing"|"clientes"|"rrhh"|"otro","summary":"Resumen breve 1-2 oraciones describiendo el contenido"}
Reglas:
- Detectá tipo de datos por los nombres de columnas y contenido de las filas
- Si ves columnas como ganancia, monto, precio, venta, facturación → "ventas"
- Si ves gasto, costo, proveedor, egreso → "gastos"
- Si ves stock, cantidad, inventario, existencia → "stock"
- Si ves campaña, clicks, impresiones, ROAS, alcance → "marketing"
- Si ves cliente, comprador, razón social → "clientes"
- Si ves empleado, sueldo, salario, legajo → "rrhh"
- Si no podés determinar categoría, usá "otro"`;

  const content = `Archivo: "${fileName}"
Columnas: ${JSON.stringify(headers)}
Primeras ${sampleRows.length} filas de ejemplo:
${JSON.stringify(sampleRows.slice(0, 10), null, 2)}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 256,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI classification error [${resp.status}]: ${errText}`);
  }

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(raw);
    return {
      category: parsed.category || "otro",
      summary: parsed.summary || "Sin resumen",
    };
  } catch {
    return { category: "otro", summary: "No se pudo clasificar" };
  }
}

// ─── AI Extraction for non-tabular content (PDF, images, etc.) ─
async function extractWithAI(
  content: string,
  fileName: string,
  imageBase64?: string,
  imageMime?: string,
  metadata?: Record<string, unknown>
): Promise<{ category: string; data: unknown; summary: string; rowCount: number }> {
  console.log(`[process-file] Calling AI extraction for "${fileName}"`);

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
    messages.push({ role: "user", content: [
      { type: "text", text: `Analizá este archivo "${fileName}". Extraé TODOS los datos numéricos, tablas, y contenido relevante.${metadata ? ` Metadata: ${JSON.stringify(metadata)}` : ''}` },
      { type: "image_url", image_url: { url: `data:${imageMime};base64,${imageBase64}`, detail: "high" } },
    ]});
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

// ─── Deterministic row storage ────────────────────────────────
// Stores rows directly without AI, in batches
async function storeRowBatch(
  sb: ReturnType<typeof createClient>,
  rows: Record<string, unknown>[],
  headers: string[],
  category: string,
  summary: string,
  fileUploadId: string,
  companyId: string,
  batchIndex: number,
): Promise<void> {
  // Delete any existing data for this batch
  await sb.from("file_extracted_data")
    .delete()
    .eq("file_upload_id", fileUploadId)
    .eq("chunk_index", batchIndex);

  await sb.from("file_extracted_data").insert({
    file_upload_id: fileUploadId,
    company_id: companyId,
    data_category: category,
    extracted_json: { columns: headers, data: rows },
    summary: batchIndex === 0 ? summary : `Lote ${batchIndex + 1}`,
    row_count: rows.length,
    chunk_index: batchIndex,
  });
}

// ─── Process structured tabular data (the new deterministic path) ─
async function processTabularData(
  sb: ReturnType<typeof createClient>,
  allRows: Record<string, unknown>[],
  headers: string[],
  fileName: string,
  fileUploadId: string,
  companyId: string,
): Promise<{ category: string; summary: string; totalRows: number }> {
  console.log(`[process-file] Deterministic tabular processing: ${allRows.length} rows, ${headers.length} columns`);

  // Step 1: AI classifies using headers + sample (one cheap call)
  const sampleRows = allRows.slice(0, 10);
  const { category, summary } = await classifyWithAI(headers, sampleRows, fileName);
  console.log(`[process-file] Classification: category=${category}`);

  // Step 2: Store all rows in batches deterministically (no AI)
  const totalBatches = Math.ceil(allRows.length / BATCH_SIZE);
  console.log(`[process-file] Storing ${allRows.length} rows in ${totalBatches} batch(es)`);

  // Clean up any previous extracted data (including _raw_cache)
  await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);

  for (let i = 0; i < totalBatches; i++) {
    const batchRows = allRows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    await storeRowBatch(sb, batchRows, headers, category,
      i === 0 ? `${summary} (${allRows.length} filas en ${totalBatches} lotes)` : summary,
      fileUploadId, companyId, i);
  }

  // Update total_chunks
  await sb.from("file_uploads").update({ total_chunks: totalBatches }).eq("id", fileUploadId);

  return { category, summary, totalRows: allRows.length };
}

// ─── Text chunking for non-tabular content (PDF, etc.) ────────
function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks;
}

async function processChunksLimited(
  sb: ReturnType<typeof createClient>,
  chunks: { content: string; index: number }[],
  fileName: string,
  fileUploadId: string,
  companyId: string,
  metadata: Record<string, unknown>,
  startChunk: number,
): Promise<{ category: string; summary: string; totalRows: number; processedUpTo: number; allDone: boolean }> {
  let mainCategory = "otro";
  const summaries: string[] = [];
  let totalRows = 0;
  const endChunk = Math.min(startChunk + MAX_CHUNKS_PER_INVOCATION, chunks.length);

  for (let i = startChunk; i < endChunk; i++) {
    const chunk = chunks[i];
    const chunkMeta = { ...metadata, chunk_index: chunk.index, total_chunks: chunks.length };
    const result = await extractWithAI(chunk.content, fileName, undefined, undefined, chunkMeta);

    await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId).eq("chunk_index", chunk.index);
    await sb.from("file_extracted_data").insert({
      file_upload_id: fileUploadId, company_id: companyId,
      data_category: result.category, extracted_json: result.data,
      summary: result.summary, row_count: result.rowCount, chunk_index: chunk.index,
    });

    if (i === startChunk) mainCategory = result.category;
    summaries.push(result.summary);
    totalRows += result.rowCount;
  }

  const allDone = endChunk >= chunks.length;
  const combinedSummary = allDone && chunks.length > 1
    ? `${summaries[0]} (${chunks.length} bloques procesados, ${totalRows} filas totales)`
    : summaries[0] || "Procesando...";

  return { category: mainCategory, summary: combinedSummary, totalRows, processedUpTo: endChunk, allDone };
}

// ─── Main Handler ─────────────────────────────────────────────
serve(async (req) => {
  console.log("[process-file] Function invoked");

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
    const startChunk = body.startChunk || 0;

    // ─── NEW: Structured row batch from client ────────────────
    const rowBatch = body.rowBatch as Record<string, unknown>[] | undefined;
    const headers = body.headers as string[] | undefined;
    const batchIndex = body.batchIndex as number | undefined;
    const totalBatches = body.totalBatches as number | undefined;
    const totalRows = body.totalRows as number | undefined;
    const explicitCategory = body.category as string | undefined; // passed from client for batches > 0

    // ─── LEGACY: preParsedData (CSV text from old client code) ─
    const preParsedData = body.preParsedData;

    console.log(`[process-file] fileUploadId=${fileUploadId}, companyId=${companyId}`);

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

    let resultInfo: { category: string; summary: string; totalRows: number };

    // ══════════════════════════════════════════════════════════
    // PATH A: Structured row batch (new deterministic pipeline)
    // ══════════════════════════════════════════════════════════
    if (rowBatch && headers && batchIndex !== undefined && totalBatches !== undefined) {
      console.log(`[process-file] Row batch ${batchIndex + 1}/${totalBatches} for "${file_name}" (${rowBatch.length} rows)`);

      if (batchIndex === 0) {
        // First batch: classify with AI
        const { category, summary } = await classifyWithAI(headers, rowBatch.slice(0, 10), file_name);

        // Store classification metadata for subsequent batches
        await sb.from("file_extracted_data").delete()
          .eq("file_upload_id", fileUploadId)
          .eq("data_category", "_classification");
        await sb.from("file_extracted_data").insert({
          file_upload_id: fileUploadId,
          company_id: companyId,
          data_category: "_classification",
          extracted_json: { category, summary },
          chunk_index: 0,
          row_count: 0,
        });

        // Store first batch
        await storeRowBatch(sb, rowBatch, headers, category,
          `${summary} (${totalRows || rowBatch.length} filas)`, fileUploadId, companyId, 0);

        await sb.from("file_uploads").update({
          total_chunks: totalBatches,
          next_chunk_index: 1,
        }).eq("id", fileUploadId);

        if (totalBatches === 1) {
          // Single batch → done
          await sb.from("file_extracted_data").delete()
            .eq("file_upload_id", fileUploadId)
            .eq("data_category", "_classification");
          await sb.from("file_uploads").update({ status: "processed", processing_error: null }).eq("id", fileUploadId);
        }

        return new Response(JSON.stringify({
          success: true, category, summary,
          batchIndex: 0, totalBatches,
          done: totalBatches === 1,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } else {
        // Subsequent batch: use explicit category from client, or fall back to DB lookup
        let category = explicitCategory || "";
        let summary = "";

        if (!category) {
          const { data: classData } = await sb.from("file_extracted_data")
            .select("extracted_json")
            .eq("file_upload_id", fileUploadId)
            .eq("data_category", "_classification")
            .single();
          category = (classData?.extracted_json as any)?.category || "otro";
          summary = (classData?.extracted_json as any)?.summary || "";
        }

        await storeRowBatch(sb, rowBatch, headers, category,
          `Lote ${batchIndex + 1}/${totalBatches}`, fileUploadId, companyId, batchIndex);

        await sb.from("file_uploads").update({
          next_chunk_index: batchIndex + 1,
        }).eq("id", fileUploadId);

        const isLast = batchIndex === totalBatches - 1;
        if (isLast) {
          // Clean up classification metadata
          await sb.from("file_extracted_data").delete()
            .eq("file_upload_id", fileUploadId)
            .eq("data_category", "_classification");
          await sb.from("file_uploads").update({ status: "processed", processing_error: null }).eq("id", fileUploadId);
          console.log(`[process-file] ✅ All ${totalBatches} batches stored for "${file_name}"`);
        }

        return new Response(JSON.stringify({
          success: true, category,
          batchIndex, totalBatches,
          done: isLast,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ══════════════════════════════════════════════════════════
    // PATH B: Legacy preParsedData (CSV text — try to parse to rows)
    // ══════════════════════════════════════════════════════════
    if (preParsedData) {
      const content = typeof preParsedData === 'string' ? preParsedData : JSON.stringify(preParsedData);

      // Try to parse CSV text into structured rows
      const rows = parseCSV(content);
      if (rows.length > 0) {
        const parsedHeaders = Object.keys(rows[0]);
        console.log(`[process-file] Legacy preParsed → parsed ${rows.length} rows, using deterministic path`);
        resultInfo = await processTabularData(sb, rows, parsedHeaders, file_name, fileUploadId, companyId);
      } else {
        // Fallback: treat as unstructured text (shouldn't happen often)
        console.log(`[process-file] Legacy preParsed → could not parse rows, using AI extraction`);
        const result = await extractWithAI(content.substring(0, MAX_CONTENT_CHARS), file_name);
        await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
        await sb.from("file_extracted_data").insert({
          file_upload_id: fileUploadId, company_id: companyId,
          data_category: result.category, extracted_json: result.data,
          summary: result.summary, row_count: result.rowCount, chunk_index: 0,
        });
        resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
      }

      await sb.from("file_uploads").update({ status: "processed", processing_error: null }).eq("id", fileUploadId);
      console.log(`[process-file] ✅ Completed "${file_name}" - ${resultInfo.category}, ${resultInfo.totalRows} rows`);
      return new Response(JSON.stringify({ success: true, ...resultInfo }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════
    // PATH C: Server-side file processing (download from R2)
    // ══════════════════════════════════════════════════════════
    if (!storage_path) throw new Error("No storage_path");
    const buffer = await downloadFromR2(storage_path);
    const bytes = new Uint8Array(buffer);
    console.log(`[process-file] File downloaded, ${bytes.length} bytes`);

    // ─── CSV/TXT: Deterministic row processing ──────────────
    if (['csv', 'txt'].includes(ext)) {
      const text = new TextDecoder().decode(buffer);
      let allRows = parseCSV(text);
      console.log(`[process-file] CSV parsed: ${allRows.length} rows`);

      // Apply fixBrokenHeaders to CSV too
      if (allRows.length > 0) {
        const fixed = fixBrokenHeaders(allRows);
        allRows = fixed.rows;
        const parsedHeaders = fixed.headers.length > 0 ? fixed.headers : Object.keys(allRows[0]);
        resultInfo = await processTabularData(sb, allRows, parsedHeaders, file_name, fileUploadId, companyId);
      } else {
        // Empty CSV — use AI on raw text
        const result = await extractWithAI(text.substring(0, MAX_CONTENT_CHARS), file_name);
        await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
        await sb.from("file_extracted_data").insert({
          file_upload_id: fileUploadId, company_id: companyId,
          data_category: result.category, extracted_json: result.data,
          summary: result.summary, row_count: result.rowCount, chunk_index: 0,
        });
        resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
      }

    // ─── Excel: Deterministic if possible, error if too large ─
    } else if (['xls', 'xlsx'].includes(ext)) {
      if (buffer.byteLength > MAX_EXCEL_FILE_SIZE) {
        const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(1);
        console.warn(`[process-file] Excel too large: ${sizeMB}MB`);
        // Instead of erroring, try to parse anyway with limits
        try {
          const wb = XLSX.read(bytes, { type: 'array', dense: true, cellStyles: false, cellNF: false, cellText: false, sheetRows: MAX_EXCEL_ROWS });
          const allRows: Record<string, unknown>[] = [];
          let headers: string[] = [];
          for (const sheetName of wb.SheetNames) {
            const sheet = wb.Sheets[sheetName];
            if (!sheet) continue;
            const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
            if (sheetRows.length > 0 && headers.length === 0) {
              headers = Object.keys(sheetRows[0]);
            }
            allRows.push(...sheetRows);
            if (allRows.length >= MAX_EXCEL_ROWS) break;
          }
          if (allRows.length > MAX_EXCEL_ROWS) allRows.length = MAX_EXCEL_ROWS;

          if (allRows.length > 0) {
            const fixed = fixBrokenHeaders(allRows);
            resultInfo = await processTabularData(sb, fixed.rows, fixed.headers.length > 0 ? fixed.headers : headers, file_name, fileUploadId, companyId);
          } else {
            throw new Error("No rows parsed");
          }
        } catch (xlsErr) {
          const errMsg = `Archivo Excel demasiado grande (${sizeMB} MB). Usá el botón de reprocesar o convertilo a CSV.`;
          await sb.from("file_uploads").update({ status: "error", processing_error: errMsg }).eq("id", fileUploadId);
          return new Response(JSON.stringify({ success: false, error: errMsg }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        // Normal Excel — parse to rows deterministically
        try {
          const wb = XLSX.read(bytes, { type: 'array', dense: true, cellStyles: false, cellNF: false, cellText: false, sheetRows: MAX_EXCEL_ROWS });
          const allRows: Record<string, unknown>[] = [];
          let headers: string[] = [];
          for (const sheetName of wb.SheetNames) {
            const sheet = wb.Sheets[sheetName];
            if (!sheet) continue;
            const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
            if (sheetRows.length > 0 && headers.length === 0) {
              headers = Object.keys(sheetRows[0]);
            }
            allRows.push(...sheetRows);
            if (allRows.length >= MAX_EXCEL_ROWS) break;
          }
          if (allRows.length > MAX_EXCEL_ROWS) allRows.length = MAX_EXCEL_ROWS;

          if (allRows.length > 0) {
            resultInfo = await processTabularData(sb, allRows, headers, file_name, fileUploadId, companyId);
          } else {
            // Empty Excel — try AI extraction on CSV text
            const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ',', RS: '\n' });
            const result = await extractWithAI(csv.substring(0, MAX_CONTENT_CHARS), file_name);
            await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
            await sb.from("file_extracted_data").insert({
              file_upload_id: fileUploadId, company_id: companyId,
              data_category: result.category, extracted_json: result.data,
              summary: result.summary, row_count: result.rowCount, chunk_index: 0,
            });
            resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
          }
        } catch (xlsErr) {
          const errMsg = xlsErr instanceof Error ? xlsErr.message : 'Unknown parse error';
          throw new Error(`No se pudo leer el archivo Excel. ${errMsg}`);
        }
      }

    // ─── Images ─────────────────────────────────────────────
    } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
      const processingMetadata: Record<string, unknown> = { method: 'vision', format: ext, size_kb: Math.round(buffer.byteLength / 1024) };
      let imageBase64: string | undefined;
      let imageMime: string | undefined;
      let content = '';

      if (buffer.byteLength > MAX_IMAGE_BYTES) {
        content = `[Imagen "${file_name}" - ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB. Demasiado grande para visión.]`;
      } else {
        imageBase64 = uint8ToBase64(bytes);
        imageMime = getMimeType(file_name);
      }

      const result = await extractWithAI(content, file_name, imageBase64, imageMime, processingMetadata);
      await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
      await sb.from("file_extracted_data").insert({
        file_upload_id: fileUploadId, company_id: companyId,
        data_category: result.category, extracted_json: result.data,
        summary: result.summary, row_count: result.rowCount, chunk_index: 0,
      });
      resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };

    // ─── PDF ────────────────────────────────────────────────
    } else if (ext === 'pdf') {
      const pdfResult = await extractPdfText(buffer);
      const processingMetadata: Record<string, unknown> = { method: pdfResult.method, pages: pdfResult.pages };

      if (pdfResult.method === 'text_extraction' && pdfResult.text.length > 50) {
        // Try to parse PDF text as CSV (some PDFs are tabular)
        const pdfRows = parseCSV(pdfResult.text);
        if (pdfRows.length > 10) {
          const pdfHeaders = Object.keys(pdfRows[0]);
          resultInfo = await processTabularData(sb, pdfRows, pdfHeaders, file_name, fileUploadId, companyId);
        } else if (pdfResult.text.length > MAX_CONTENT_CHARS) {
          const textChunks = chunkText(pdfResult.text, CHUNK_CHARS);
          processingMetadata.chunked = true;
          processingMetadata.total_chunks = textChunks.length;
          const chunks = textChunks.map((t, i) => ({
            content: `[PDF "${file_name}" - chunk ${i + 1}/${textChunks.length}]\n\n${t}`,
            index: i,
          }));
          const r = await processChunksLimited(sb, chunks, file_name, fileUploadId, companyId, processingMetadata, startChunk);
          if (!r.allDone) {
            await sb.from("file_uploads").update({ status: "queued", processing_error: null, next_chunk_index: r.processedUpTo }).eq("id", fileUploadId);
            return new Response(JSON.stringify({ success: true, partial: true, processedUpTo: r.processedUpTo }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          resultInfo = { category: r.category, summary: r.summary, totalRows: r.totalRows };
        } else {
          const content = `[PDF con ${pdfResult.pages} páginas]\n\n${pdfResult.text}`;
          const result = await extractWithAI(content, file_name, undefined, undefined, processingMetadata);
          await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
          await sb.from("file_extracted_data").insert({
            file_upload_id: fileUploadId, company_id: companyId,
            data_category: result.category, extracted_json: result.data,
            summary: result.summary, row_count: result.rowCount, chunk_index: 0,
          });
          resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
        }
      } else {
        let content: string;
        if (buffer.byteLength <= MAX_IMAGE_BYTES) {
          content = `[PDF escaneado - ${pdfResult.pages} páginas. Texto parcial: "${pdfResult.text.substring(0, 2000)}". Nombre: "${file_name}".]`;
        } else {
          content = `[PDF muy grande (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). Texto parcial: "${pdfResult.text.substring(0, 1000)}". Nombre: "${file_name}".]`;
        }
        const result = await extractWithAI(content, file_name, undefined, undefined, processingMetadata);
        await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
        await sb.from("file_extracted_data").insert({
          file_upload_id: fileUploadId, company_id: companyId,
          data_category: result.category, extracted_json: result.data,
          summary: result.summary, row_count: result.rowCount, chunk_index: 0,
        });
        resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
      }

    // ─── XML / Word / Other ─────────────────────────────────
    } else {
      let content: string;
      if (['xml', 'doc', 'docx'].includes(ext)) {
        try {
          content = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
          if (['doc', 'docx'].includes(ext)) content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          content = content.substring(0, MAX_CONTENT_CHARS);
        } catch {
          content = `[Archivo ${ext} - ${(buffer.byteLength / 1024).toFixed(0)} KB. Nombre: ${file_name}]`;
        }
      } else {
        content = `[Archivo desconocido: ${ext}. Nombre: "${file_name}". ${(buffer.byteLength / 1024).toFixed(0)} KB]`;
      }
      const result = await extractWithAI(content, file_name);
      await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
      await sb.from("file_extracted_data").insert({
        file_upload_id: fileUploadId, company_id: companyId,
        data_category: result.category, extracted_json: result.data,
        summary: result.summary, row_count: result.rowCount, chunk_index: 0,
      });
      resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
    }

    await sb.from("file_uploads").update({ status: "processed", processing_error: null }).eq("id", fileUploadId);
    console.log(`[process-file] ✅ Completed "${file_name}" - category=${resultInfo.category}, rows=${resultInfo.totalRows}`);

    return new Response(JSON.stringify({
      success: true, ...resultInfo,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[process-file] ❌ Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (fileUploadId) {
      try { await sb.from("file_uploads").update({ status: "error", processing_error: msg }).eq("id", fileUploadId); } catch { /* ignore */ }
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
