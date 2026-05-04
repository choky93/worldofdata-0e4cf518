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

const RATE_LIMIT_MESSAGE = "Límite de API alcanzado. El archivo será reprocesado automáticamente en unos minutos.";
const RETRY_DELAYS = [5000, 15000, 30000]; // 5s, 15s, 30s

class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

// Ola 20: pricing snapshot + log helper para tracking de costos
const ANTHROPIC_PRICING: Record<string, { input: number; inputCached: number; output: number }> = {
  "claude-sonnet-4-5": { input: 3.00, inputCached: 0.30, output: 15.00 },
};

async function logAnthropicUsage(
  body: { model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } },
  ctx?: { companyId?: string; userId?: string | null; feature?: string; metadata?: Record<string, unknown> },
) {
  if (!ctx?.companyId || !body?.usage) return;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const model = body.model || "claude-sonnet-4-5";
    const p = ANTHROPIC_PRICING[model];
    const u = body.usage;
    const inputTokens = u.input_tokens || 0;
    const cachedTokens = u.cache_read_input_tokens || 0;
    const outputTokens = u.output_tokens || 0;
    const cost = p
      ? ((cachedTokens / 1_000_000) * p.inputCached) +
        ((Math.max(0, inputTokens - cachedTokens) / 1_000_000) * p.input) +
        ((outputTokens / 1_000_000) * p.output)
      : 0;

    await sb.from("api_usage_logs").insert({
      company_id: ctx.companyId,
      user_id: ctx.userId ?? null,
      provider: "anthropic",
      model,
      feature: ctx.feature || "other",
      input_tokens: inputTokens,
      input_tokens_cached: cachedTokens || null,
      output_tokens: outputTokens,
      cost_usd: cost,
      metadata: ctx.metadata || {},
    });
  } catch (e) {
    console.error("[logAnthropicUsage] insert failed:", e);
  }
}

async function fetchAnthropicWithRetry(body: object, usageCtx?: { companyId?: string; userId?: string | null; feature?: string; metadata?: Record<string, unknown> }): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      const data = await resp.json();
      // Ola 20: log usage si tenemos context
      logAnthropicUsage(data, usageCtx);
      return data;
    }
    if ((resp.status === 429 || resp.status === 529 || resp.status === 503) && attempt < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[attempt];
      console.warn(`[process-file] Anthropic ${resp.status}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS.length})`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    if (resp.status === 429 || resp.status === 529 || resp.status === 503) {
      throw new RateLimitError(`Anthropic rate limit after ${RETRY_DELAYS.length} retries [${resp.status}]`);
    }
    const errText = await resp.text();
    throw new Error(`Anthropic error [${resp.status}]: ${errText}`);
  }
  throw new Error("Unreachable");
}

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
  if (!resp.ok) {
    if (resp.status === 404 || resp.status === 403) {
      throw new Error(`Archivo no encontrado en storage. Volvé a subir el archivo desde la interfaz.`);
    }
    throw new Error(`R2 download failed [${resp.status}]`);
  }
  return resp.arrayBuffer();
}

// ─── Encoding Detection ────────────────────────────────────────
const LATIN1_ARTIFACTS = /[\u00c3][\u00a1\u00a9\u00ad\u00b1\u00b3\u00ba\u00bc]/g; // Ã© Ã± Ã¡ etc.

function detectAndFixEncoding(buffer: ArrayBuffer): { text: string; encodingWarning: string | null } {
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  
  // Check for Latin-1 interpreted as UTF-8 artifacts
  const artifactMatches = text.match(LATIN1_ARTIFACTS);
  if (artifactMatches && artifactMatches.length > 3) {
    console.log(`[process-file] Detected ${artifactMatches.length} Latin-1 encoding artifacts, re-decoding...`);
    try {
      text = new TextDecoder('iso-8859-1').decode(buffer);
      // Check if re-decoded text still has issues
      const recheck = text.match(LATIN1_ARTIFACTS);
      if (!recheck || recheck.length < artifactMatches.length) {
        console.log(`[process-file] Re-decoded with Latin-1 successfully`);
        return { text, encodingWarning: null };
      }
    } catch {
      // fallback
    }
    return { 
      text, 
      encodingWarning: "El archivo puede tener problemas de codificación de caracteres. Los nombres con tildes o ñ pueden aparecer incorrectos." 
    };
  }
  
  return { text, encodingWarning: null };
}

// ─── CSV Parser (RFC 4180) ─────────────────────────────────────
/**
 * Median-stability delimiter detector. Scores candidates [\t, ;, |, ,]
 * across the first 5 non-empty lines (quote-aware). Picks the candidate
 * with the highest min field count and stable spread (max-min ≤ 2).
 */
function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 5);
  if (lines.length === 0) return ',';
  const candidates = ['\t', ';', '|', ','];
  let best = ',';
  let bestScore = 0;
  for (const d of candidates) {
    const counts = lines.map(l => {
      let inQuotes = false;
      let count = 1;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c === '"') inQuotes = !inQuotes;
        else if (c === d && !inQuotes) count++;
      }
      return count;
    });
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    if (min >= 2 && (max - min) <= 2 && min > bestScore) {
      best = d;
      bestScore = min;
    }
  }
  return best;
}

function parseCSV(text: string): Record<string, unknown>[] {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const delimiter = detectDelimiter(text);
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

// ─── Data Cleaning (serial dates + summary rows) ──────────────
const DATE_KW = ['fecha', 'date', 'periodo', 'mes', 'month', 'dia', 'day'];
const NAME_KW = ['nombre', 'name', 'producto', 'product', 'campana', 'campaign',
  'detalle', 'concepto', 'descripcion', 'articulo', 'item', 'cliente', 'client'];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function excelSerialToISO(serial: number): string {
  return new Date((serial - 25569) * 86400000).toISOString().split('T')[0];
}

/**
 * Convert Excel serial dates to ISO strings.
 * Checks both keyword-matched headers AND explicitly mapped date columns.
 */
function convertSerialDates(rows: Record<string, unknown>[], headers: string[], mappedDateCol?: string | null): void {
  const dateHeaders = new Set(headers.filter(h => {
    const n = norm(h);
    const lower = h.toLowerCase();
    // Match by keyword OR unnamed/empty column patterns (SheetJS: __EMPTY, __EMPTY_1; pandas: Unnamed: 0, col0, etc.)
    return DATE_KW.some(kw => n.includes(kw))
      || lower.startsWith('__empty')
      || lower.startsWith('unnamed')
      || /^col\d+$/.test(lower);
  }));
  if (mappedDateCol) dateHeaders.add(mappedDateCol);
  if (dateHeaders.size === 0) return;

  for (const row of rows) {
    for (const h of dateHeaders) {
      const val = row[h];
      if (typeof val === 'number' && val > 1 && val < 200000) {
        row[h] = excelSerialToISO(val);
        continue;
      }
      if (typeof val === 'string') {
        const trimmed = val.trim();
        const num = parseFloat(trimmed);
        if (!isNaN(num) && num > 25569 && num < 200000 && /^\d+(\.\d+)?$/.test(trimmed)) {
          row[h] = excelSerialToISO(num);
        }
      }
    }
  }
}

function filterSummaryRows(rows: Record<string, unknown>[], headers: string[]): Record<string, unknown>[] {
  const nameHeaders = headers.filter(h => NAME_KW.some(kw => norm(h).includes(kw)));
  if (nameHeaders.length === 0) return rows;
  let filteredCount = 0;
  const result = rows.filter(row => {
    const allEmpty = nameHeaders.every(h => {
      const v = row[h];
      return v === undefined || v === null || String(v ?? '').trim() === '';
    });
    if (!allEmpty) return true;
    const hasNum = Object.values(row).some(v => typeof v === 'number' && v > 0);
    if (hasNum) { filteredCount++; return false; }
    return true;
  });
  if (filteredCount > 0) {
    const pct = Math.round(filteredCount / rows.length * 100);
    console.log(`[process-file] Filtered ${filteredCount} summary/empty-name rows (${pct}% of total)`);
    if (pct > 10) {
      console.warn(`[process-file] ⚠️ High filter rate (${pct}%) — possible data loss from merged cells or unnamed rows`);
    }
  }
  return result;
}

function cleanRows(rows: Record<string, unknown>[], headers: string[], mappedDateCol?: string | null): Record<string, unknown>[] {
  convertSerialDates(rows, headers, mappedDateCol);
  return filterSummaryRows(rows, headers);
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

// Wave A: short hints describing typical column structure of common origins.
// Prepended to the classification prompt when the user declared the source
// system at upload time. Only listed systems get a non-empty hint; others
// fall back to the generic prompt.
function getExpectedColumnsHint(sourceSystem?: string | null): string {
  if (!sourceSystem) return '';
  const hints: Record<string, string> = {
    meta_ads: 'Reporte de Meta Ads (Facebook/Instagram). Columnas típicas: "Nombre de la campaña", "Inicio del informe", "Fin del informe", "Importe gastado (ARS/USD)", "Impresiones", "Alcance", "Clics (todos)", "CTR (todos)", "CPC (todos)", "Resultados", "Costo por resultado", "ROAS de resultados".',
    google_ads: 'Reporte de Google Ads. Columnas típicas: "Campaign", "Day"/"Date"/"Week", "Cost", "Impressions", "Clicks", "CTR", "Avg. CPC", "Conversions", "Cost / conv.", "Conv. value".',
    tiktok_ads: 'Reporte de TikTok Ads. Columnas típicas: "Campaign name", "By Day"/"Stat time day", "Cost", "Impressions", "Clicks", "CTR", "CPC", "Conversions".',
    linkedin_ads: 'Reporte de LinkedIn Campaign Manager. Columnas típicas: "Campaign Name", "Date Range"/"Day Started", "Total Spent", "Impressions", "Clicks", "Average CTR", "Conversions".',
    mailchimp: 'Reporte de Mailchimp. Columnas típicas: "Title"/"Campaign", "Send Date"/"Send Time", "Successful Deliveries", "Opens", "Clicks", "Open Rate", "Click Rate".',
    tango: 'Export de Tango Gestión (PyME argentina). Columnas típicas: "Cód. Cliente", "Razón Social", "Fecha", "Tipo Comprobante", "Número", "Importe", "Importe Neto", "IVA", "Total". Para stock: "Cód. Producto", "Descripción", "Stock", "Precio".',
    bejerman: 'Export de Bejerman. Columnas típicas: "Fecha", "Comprobante", "Cliente", "Razón Social", "Importe", "Subtotal", "IVA", "Total".',
    contabilium: 'Export de Contabilium. Columnas típicas: "Fecha", "Numero", "Tipo", "Cliente", "Subtotal", "IVA", "Total", "Estado".',
    xubio: 'Export de Xubio. Columnas típicas: "Fecha", "Tipo de Comprobante", "Numero", "Cliente/Proveedor", "Subtotal", "IVA", "Total".',
    mercado_pago: 'Reporte de Mercado Pago. Columnas típicas: "Fecha de origen", "Fecha de aprobación", "Detalle de la operación", "Tipo de operación", "Estado", "Valor del producto", "Comisión", "Dinero recibido", "ID de operación".',
    afip_mis_comprobantes: 'Export de AFIP Mis Comprobantes. Columnas típicas: "Fecha de Emisión", "Tipo de Comprobante", "Punto de Venta", "Número Desde", "CUIT", "Denominación Emisor"/"Receptor", "Tipo Cambio", "Imp. Neto Gravado", "IVA", "Imp. Total".',
    mercado_libre: 'Reporte de ventas Mercado Libre. Columnas típicas: "Fecha de venta", "# de venta", "Producto", "SKU", "Cantidad", "Precio unitario", "Total", "Estado", "Comprador".',
    tienda_nube: 'Export de Tienda Nube. Columnas típicas: "Fecha", "Número de orden", "Cliente", "Email", "Total", "Estado de pago", "Productos".',
    shopify: 'Export de Shopify. Columnas típicas: "Name" (order), "Created at", "Total", "Subtotal", "Taxes", "Financial Status", "Customer", "Lineitem name", "Lineitem quantity".',
    pipedrive: 'Export de Pipedrive (CRM). Columnas típicas: "Title" (deal), "Value", "Currency", "Stage", "Status", "Owner", "Organization", "Person", "Expected close date", "Add time".',
    hubspot: 'Export de HubSpot (CRM). Columnas típicas: "Deal Name", "Amount", "Deal Stage", "Pipeline", "Close Date", "Create Date", "Deal Owner", "Associated Company", "Deal Type".',
    salesforce: 'Export de Salesforce (CRM). Columnas típicas: "Opportunity Name", "Amount", "Stage", "Close Date", "Owner Name", "Account Name", "Probability (%)", "Forecast Category", "Lead Source".',
    zoho: 'Export de Zoho CRM. Columnas típicas: "Deal Name", "Amount", "Stage", "Closing Date", "Created Time", "Deal Owner", "Account Name", "Probability (%)".',
  };
  return hints[sourceSystem] || '';
}

// ─── AI Classification (lightweight — headers + sample only) ──
async function classifyWithAI(
  headers: string[],
  sampleRows: Record<string, unknown>[],
  fileName: string,
  sheetName?: string,
  usageCtx?: { companyId?: string; userId?: string | null; fileUploadId?: string },
  sourceSystem?: string | null,
): Promise<{ category: string; summary: string; column_mapping: Record<string, string | null> }> {
  console.log(`[process-file] AI classification for "${fileName}"${sheetName ? ` (hoja: "${sheetName}")` : ''}${sourceSystem ? ` [origen: ${sourceSystem}]` : ''} (${headers.length} cols, ${sampleRows.length} sample rows)`);

  // Wave A: prepend a strong prior when the user declared the origin system.
  const sourceHint = getExpectedColumnsHint(sourceSystem);
  const sourcePreamble = sourceSystem
    ? `IMPORTANT: This file is exported from \`${sourceSystem}\`.${sourceHint ? ` Expected column structure: ${sourceHint}` : ''} Use this as STRONG PRIOR when classifying and mapping columns. If the headers clearly match this origin, prefer the standard mapping for that system over generic guesses.\n\n`
    : '';

  const systemPrompt = sourcePreamble + `Sos un especialista en análisis de datos de PyMEs latinoamericanas. Tu tarea es clasificar archivos de datos de negocios y mapear sus columnas a campos semánticos estándar.

ROL: Actuás como un contador/analista de datos experto en empresas argentinas. Conocés todos los formatos de archivos que usan las PyMEs: desde Excel prolijo hasta CSVs exportados de sistemas de gestión, reportes de Meta Ads, informes de stock de depósito, y resúmenes de ventas hechos a mano.

TAREA: Dado un archivo con sus columnas y filas de ejemplo, determiná:

1. A qué categoría de datos corresponde

2. Qué columna del archivo original corresponde a cada campo semántico

CATEGORÍAS DISPONIBLES:

- "ventas": registros de ventas YA CONCRETADAS, facturación, ingresos, pedidos cerrados, transacciones reales

- "gastos": egresos, costos, pagos realizados, facturas de proveedores, gastos operativos

- "stock": inventario, productos, unidades, depósito, mercadería

- "facturas": comprobantes de venta o compra individuales (AFIP, factura A/B/C, remito)

- "marketing": inversión publicitaria, Meta Ads, Google Ads, campañas, métricas de performance

- "clientes": base de clientes/contactos plana (lista de quién compra), compradores, deudores, cuentas corrientes. SIN etapas ni pipeline.

- "crm": exportaciones de un CRM (Salesforce, HubSpot, Pipedrive, Zoho, Microsoft Dynamics) — oportunidades de venta en distintas ETAPAS del pipeline (Prospecting/Qualification/Proposal/Negotiation/Closed Won/Closed Lost). DIFERENCIA CLAVE con "ventas": acá las ventas son POTENCIALES (deals abiertos), no transacciones cerradas. Señales fuertes: columnas "Stage", "Pipeline", "Opportunity", "Deal", "Owner", "Probability", "Close Date", "Expected Close", "Account Name", "Lead Source", "Forecast Category". También aplica a archivos de "accounts" (cuentas/empresas en el CRM) o "contacts" (contactos individuales).

- "rrhh": empleados, sueldos, liquidaciones, personal

- "operaciones": compras a proveedores, logística, envíos, recepciones de mercadería

- "finanzas": flujo de caja, movimientos bancarios, extractos, presupuesto financiero

- "otro": no encaja claramente en ninguna categoría anterior

REGLA CRÍTICA: si el archivo tiene una columna "Stage" / "Pipeline" / "Deal Stage" / "Opportunity Stage" CON valores como "Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost" → ES "crm", NUNCA "ventas". Las ventas tradicionales son cerradas; el pipeline tiene oportunidades en distintos estados.

CAMPOS SEMÁNTICOS POR CATEGORÍA:

- ventas: {"amount":"monto total de venta","date":"fecha de la venta","name":"descripción o producto","client":"nombre del cliente","category":"rubro o línea de producto","quantity":"cantidad vendida","unit_price":"precio unitario","cost":"costo o precio de costo del producto vendido","profit":"ganancia o margen de la venta","tax":"impuesto o IVA","payment_method":"forma de pago","invoice_number":"número de comprobante"}

- gastos: {"amount":"monto del gasto","date":"fecha","name":"descripción del gasto","category":"tipo de gasto","status":"estado (pagado/pendiente)","supplier":"proveedor","payment_method":"forma de pago"}

- marketing: {"spend":"monto invertido","date":"fecha o período","start_date":"fecha de inicio del período o campaña","end_date":"fecha de fin del período o campaña","campaign_name":"nombre de campaña","platform":"plataforma (Meta/Google/etc)","clicks":"clics","impressions":"impresiones","conversions":"conversiones","reach":"alcance","roas":"retorno sobre inversión publicitaria","ctr":"tasa de clics","revenue":"ingresos atribuidos"}

- stock: {"name":"nombre del producto","quantity":"unidades en stock","price":"precio de venta","cost":"costo de compra","min_stock":"stock mínimo","category":"categoría del producto","sku":"código de producto","supplier":"proveedor"}

- facturas: {"amount":"monto total","date":"fecha de emisión","name":"descripción","client":"cliente o proveedor","number":"número de factura","tax":"IVA","net_amount":"monto neto","due_date":"fecha de vencimiento","type":"tipo A/B/C/X"}

- clientes: {"name":"nombre del cliente","total_purchases":"total comprado","debt":"deuda pendiente","last_purchase":"última compra","purchase_count":"cantidad de compras","email":"email","phone":"teléfono","category":"segmento o tipo de cliente"}

- crm: {"deal_name":"nombre de la oportunidad/deal","amount":"valor del deal en USD/ARS","stage":"etapa del pipeline (Prospecting, Qualification, Proposal, Negotiation, Closed Won, Closed Lost)","close_date":"fecha estimada o real de cierre","created_date":"fecha de creación del deal","owner":"vendedor o sales rep asignado","account":"cuenta/empresa cliente","probability":"probabilidad de cierre (%)","lead_source":"origen del lead","contact_email":"email del contacto","contact_phone":"teléfono del contacto"}

- rrhh: {"name":"nombre del empleado","salary":"sueldo","date":"período o fecha","position":"cargo","hours":"horas trabajadas","department":"área"}

- operaciones: {"date":"fecha","supplier":"proveedor","amount":"monto","quantity":"cantidad","product":"producto","status":"estado del pedido","delivery_date":"fecha de entrega"}

- finanzas: {"date":"fecha","amount":"monto","type":"tipo (ingreso/egreso)","description":"descripción","balance":"saldo","account":"cuenta o banco","category":"categoría"}

- otro: {"amount":"monto si existe","date":"fecha si existe","name":"descripción principal"}

REGLAS DE MAPEO DE COLUMNAS — MUY IMPORTANTE:

El valor de cada clave semántica debe ser el NOMBRE EXACTO de la columna como aparece en los headers originales, o null si no existe.

Para encontrar la columna correcta, analizá TANTO el nombre de la columna COMO los valores de ejemplo:

- FECHAS: buscá columnas cuyos valores contengan patrones como "2024-01-01", "01/03/2024", "Enero 2024", "Ene-24", "Q1 2024", números seriales Excel (40000-50000), "enero", "feb", "mar". El header puede llamarse "Mes", "Fecha", "Período", "Period", "Month", "Semana", "Día", "Date", "Fecha emisión", "Fecha venta", o cualquier variante. Si los valores son claramente fechas, mapealo aunque el nombre no sea obvio.

- MONTOS: buscá columnas con valores numéricos que puedan representar dinero. Pueden tener formato "$1.234,56", "1234.56", "1,234.56", "1234", con o sin símbolo de moneda. Headers como "Total", "Importe", "Monto", "Amount", "Facturación", "Ventas", "Ingresos", "Spend", "Inversión", "Costo", "Precio", "Valor".

- NOMBRES/DESCRIPCIONES: texto descriptivo único por fila. Headers como "Producto", "Descripción", "Concepto", "Artículo", "Campaña", "Nombre", "Razón Social".

IMPORTANTE: Si hay una columna sin nombre o con nombre genérico (Unnamed, Column1, A, B, etc.) cuyos VALORES son fechas (2026-04-01, 01/04/2026, etc.), mapeala como 'date' aunque su nombre no sea descriptivo. Siempre analizá los VALORES de cada columna, no solo el nombre.

REGLAS ANTI-ALUCINACIÓN — CRÍTICO:

1. NUNCA inventes una columna que no existe en los headers reales del archivo.

2. Si no hay ninguna columna que razonablemente corresponda a un campo semántico, poné null. Es mejor null que un mapeo incorrecto.

3. Si una columna podría corresponder a dos campos, elegí el más probable y mencionalo en el summary.

4. Si el archivo es ambiguo y podría ser de dos categorías distintas, elegí la más probable y explicalo en summary.

5. Si el archivo tiene muy pocas columnas o datos insuficientes para clasificar con confianza, usá category "otro" y explicá en summary.

DETECCIÓN DE MÚLTIPLES MONEDAS:

Si encontrás valores con "$", "ARS", "USD", "U$S", "US$", "u$s", "€", "EUR" mezclados en la misma columna de monto, agregá en warnings: "Se detectaron múltiples monedas en los datos. Los totales pueden no ser comparables."

CONFIDENCE SCORE:

Incluí en el JSON un campo "confidence" con valor entre 0 y 1 indicando tu nivel de certeza en la clasificación. Si confidence < 0.6, explicá detalladamente en summary qué es lo que no está claro.

FORMATO DE RESPUESTA — SOLO JSON:

{"category":"...","confidence":0.95,"summary":"descripción breve del archivo y qué contiene","column_mapping":{"amount":"Nombre Exacto Columna","date":"Nombre Exacto Columna",...},"warnings":["lista de advertencias si hay datos ambiguos o columnas que no se pudieron mapear con certeza"]}`;

  const content = `Archivo: "${fileName}"${sheetName ? `\nHoja de Excel: "${sheetName}" (usá el nombre de la hoja como pista para la categoría)` : ''}
Columnas: ${JSON.stringify(headers)}
Primeras ${sampleRows.length} filas de ejemplo:
${JSON.stringify(sampleRows.slice(0, 10), null, 2)}`;

  const JSON_INSTRUCTION = "\n\nRespond with a raw JSON object only. Do not include markdown, code blocks, or any text before or after the JSON. Start your response directly with {";

  const data = await fetchAnthropicWithRetry({
    model: "claude-sonnet-4-5",
    system: systemPrompt + JSON_INSTRUCTION,
    messages: [
      { role: "user", content },
    ],
    temperature: 0.1,
    max_tokens: 1024,
  }, usageCtx ? { ...usageCtx, feature: "file_classification", metadata: { file_name: fileName, file_upload_id: usageCtx.fileUploadId } } : undefined);

  const raw = (data.content as any)?.[0]?.text || '{}';
  try {
    const parsed = JSON.parse(raw);
    return {
      category: parsed.category || "otro",
      summary: parsed.summary || "Sin resumen",
      column_mapping: parsed.column_mapping || {},
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
    };
  } catch {
    return { category: "otro", summary: "No se pudo clasificar", column_mapping: {}, confidence: 0 };
  }
}


// ─── Quarantine: Re-analysis with detailed prompt ─────────────
async function reAnalyzeMapping(
  headers: string[],
  sampleRows: Record<string, unknown>[],
  fileName: string,
  originalCategory: string,
  usageCtx?: { companyId?: string; userId?: string | null; fileUploadId?: string },
): Promise<Record<string, string | null>> {
  console.log(`[process-file] ⚠️ Quarantine re-analysis for "${fileName}" (category: ${originalCategory})`);

  const systemPrompt = `Sos un experto en análisis de datos de PyMEs latinoamericanas. Un archivo ya fue clasificado como "${originalCategory}" pero no se pudieron identificar correctamente las columnas clave.

ROL: Actuás como un analista forense de datos. Tu trabajo es examinar CADA columna en detalle, mirando tanto el nombre como los valores reales, para determinar qué representa cada una.

TAREA: Re-analizar exhaustivamente el mapeo de columnas del archivo. Tenés acceso a más filas de ejemplo que en el análisis inicial.

METODOLOGÍA DE ANÁLISIS:

Para cada columna, seguí estos pasos:

1. Leé el nombre de la columna

2. Examiná los primeros 5 valores de ejemplo

3. Identificá el patrón: ¿es una fecha? ¿un número? ¿texto descriptivo? ¿un código?

4. Determiná a qué campo semántico corresponde

DETECCIÓN DE FECHAS — TODOS LOS FORMATOS POSIBLES:

Los archivos de PyMEs argentinas pueden tener fechas en CUALQUIERA de estos formatos:

- ISO: "2024-01-15", "2024-01"

- Argentino: "15/01/2024", "15-01-2024", "15.01.2024"

- Solo mes/año: "01/2024", "1/24", "01-2024"

- Nombre del mes en español: "Enero 2024", "Ene 2024", "Ene-24", "enero", "ENERO"

- Nombre del mes abreviado: "Jan-24" (exportaciones de sistemas en inglés)

- Trimestre: "Q1 2024", "T1 2024", "1T2024", "1er Trim 2024", "Trim 1 2024"

- Semana: "Semana 12", "Sem 12 2024", "W12-2024"

- Serial Excel: números entre 40000 y 50000 (representan fechas)

- Año solo: "2024", "2023"

- Texto mixto: "Noviembre-Diciembre 2023", "Q4/2023"

Si los valores de una columna coinciden con CUALQUIERA de estos patrones, esa columna es una fecha.

DETECCIÓN DE MONTOS — TODOS LOS FORMATOS POSIBLES:

- Con punto como separador de miles: "1.234.567" o "1.234.567,89"

- Con coma como separador de miles: "1,234,567" o "1,234,567.89"

- Sin separadores: "1234567" o "1234567.89"

- Con símbolo de moneda: "$1.234", "ARS 1234", "USD 500", "u$s 500"

- Con IVA explícito: "1.000 + IVA", "1.210 (c/IVA)"

- Negativos para egresos: "-5000", "(5000)"

- En miles o millones abreviado: "1.2M", "500K", "1,2M"

DETECCIÓN DE CANTIDADES Y UNIDADES:

- Puede venir como: "100 un.", "50 kg", "200 lt", "5 cajas", o solo "100"

- Si la columna tiene números enteros o con pocas decimales y no parece ser dinero, puede ser cantidad

REGLAS ANTI-ALUCINACIÓN:

1. SOLO podés mapear columnas que REALMENTE EXISTEN en los headers del archivo

2. Si analizás los valores y no podés determinar con certeza a qué campo corresponde, poné null

3. NUNCA supongas que una columna vacía o con valores "N/A" corresponde a un campo importante

4. Si hay columnas con valores todos iguales o constantes, probablemente no sean campos de datos útiles

5. Si una columna tiene el mismo valor en todas las filas, mencionalo en warnings

FORMATO DE RESPUESTA — SOLO JSON:

{"column_mapping":{"campo1":"Nombre Exacto Columna o null",...},"confidence":0.85,"warnings":["lista de situaciones dudosas encontradas"],"analysis_notes":"explicación breve de las decisiones de mapeo tomadas"}`;

  const content = `Archivo: "${fileName}"
Columnas: ${JSON.stringify(headers)}
Todas las filas de ejemplo disponibles:
${JSON.stringify(sampleRows.slice(0, 20), null, 2)}`;

  const JSON_INSTRUCTION = "\n\nRespond with a raw JSON object only. Do not include markdown, code blocks, or any text before or after the JSON. Start your response directly with {";

  const data = await fetchAnthropicWithRetry({
    model: "claude-sonnet-4-5",
    system: systemPrompt + JSON_INSTRUCTION,
    messages: [
      { role: "user", content },
    ],
    temperature: 0.05,
    max_tokens: 512,
  }, usageCtx ? { ...usageCtx, feature: "category_detection", metadata: { file_name: fileName, file_upload_id: usageCtx.fileUploadId } } : undefined);

  const raw = (data.content as any)?.[0]?.text || '{}';
  try {
    const parsed = JSON.parse(raw);
    return parsed.column_mapping || {};
  } catch {
    return {};
  }
}

function isMappingAcceptable(mapping: Record<string, string | null>, category: string): boolean {
  // Hotfix: ampliamos las claves aceptadas. Antes Meta Ads quedaba como
  // "Pendiente de revisión" porque exporta con "Inicio del informe" / "Fin
  // del informe" → la IA los mapeaba a start_date/end_date, pero la
  // validación solo buscaba 'date' y rechazaba el archivo. Análogo para
  // CRM (close_date, created_date) y operaciones (delivery_date).
  const amountKeys = ['amount', 'spend', 'salary', 'quantity', 'total_purchases', 'price', 'cost', 'revenue', 'debt'];
  const dateKeys = ['date', 'last_purchase', 'start_date', 'end_date', 'close_date', 'created_date', 'delivery_date', 'due_date'];

  const hasAmount = amountKeys.some(k => mapping[k] != null);
  const hasDate = dateKeys.some(k => mapping[k] != null);

  // CRM: deal_name + stage es suficiente aunque no haya amount/date
  // (puede ser un export de cuentas o contactos sin valores).
  if (category === 'crm') return hasAmount || hasDate || mapping['stage'] != null || mapping['deal_name'] != null;
  if (category === 'stock') return hasAmount || mapping['name'] != null;
  if (category === 'clientes') return hasAmount || mapping['name'] != null;
  // Marketing: con tener spend O start_date/end_date alcanza
  if (category === 'marketing') return hasAmount || hasDate || mapping['campaign_name'] != null;

  return hasAmount || hasDate;
}


async function extractWithAI(
  content: string,
  fileName: string,
  imageBase64?: string,
  imageMime?: string,
  metadata?: Record<string, unknown>,
  usageCtx?: { companyId?: string; userId?: string | null; fileUploadId?: string },
): Promise<{ category: string; data: unknown; summary: string; rowCount: number }> {
  console.log(`[process-file] Calling AI extraction for "${fileName}"`);

  const systemPrompt = `Sos un especialista en extracción de datos de documentos de negocios latinoamericanos. Tu tarea es extraer datos estructurados de archivos de PyMEs argentinas.

ROL: Actuás como un analista de datos con experiencia en documentos empresariales argentinos: facturas AFIP, reportes de sistemas de gestión (Tango, Bejerman, SAP, sistemas propios), exportaciones de Meta Ads, Google Ads, hojas de cálculo de ventas, planillas de stock, extractos bancarios, remitos y más.

TAREA: Extraer TODOS los datos del documento y estructurarlos en formato JSON con columnas y filas.

DETECCIÓN AUTOMÁTICA DEL TIPO DE DOCUMENTO:

Antes de extraer, identificá qué tipo de documento es:

- Tabla de datos (ventas mensuales, stock, gastos): extraé como array de filas

- Factura o comprobante individual: extraé los campos como una sola fila

- Informe de campaña publicitaria: extraé métricas por campaña/período

- Extracto bancario: extraé movimientos como filas individuales

- Documento mixto (texto + tablas): extraé las tablas, ignorá el texto decorativo

- Imagen de pantalla (screenshot): extraé los datos visibles, indicá en summary que es captura

REGLAS DE EXTRACCIÓN — CRÍTICAS:

PARA FECHAS:

- PRESERVÁ las fechas EXACTAMENTE como aparecen en el documento original

- Si dice "Enero 2024", extraé "Enero 2024" — NO lo conviertas a "2024-01-01"

- Si dice "01/03/2024", extraé "01/03/2024" — NO lo reformatees

- Si dice "Q1 2024", extraé "Q1 2024"

- Si hay números seriales de Excel (ej: 45291), extraelos como están y mencionalo en summary

- NUNCA inventes una fecha que no está explícita en el documento

PARA NÚMEROS Y MONTOS:

- Preservá los números con su formato original: "1.234.567,89" quedá así, no lo conviertas

- Si hay símbolo de moneda, incluyelo: "$5.000", "USD 500"

- Si hay IVA discriminado, extraé tanto el neto como el total con IVA como columnas separadas

- NUNCA redondees ni truncues números

- NUNCA uses notación científica (1.2e6): siempre el número completo

- Si un número es ilegible o ambiguo, poné null y mencionalo en warnings

PARA CELDAS VACÍAS O ILEGIBLES:

- Celda vacía → null

- Celda ilegible (imagen borrosa, texto cortado) → null + mencionar en warnings

- Celda con "N/A", "-", "—", "s/d", "sin datos" → null

- NUNCA inventes un valor para completar una celda vacía

PARA NOMBRES DE COLUMNAS:

- Normalizá los nombres de columnas: minúsculas, sin acentos, sin caracteres especiales

- "Fecha de Venta" → "fecha_de_venta"

- "Total (IVA Inc.)" → "total_iva_inc"

- "CLIENTE" → "cliente"

- Mantené el significado original, solo normalizá el formato

PARA DOCUMENTOS CON MÚLTIPLES TABLAS:

- Si hay más de una tabla, extraé la más completa e importante

- Describí en summary que había otras tablas y qué contenían

- Si todas las tablas son igualmente importantes, extraé la primera y mencioná las demás

PARA DOCUMENTOS EN INGLÉS O IDIOMA MIXTO:

- Muchos sistemas exportan en inglés aunque la empresa sea argentina

- "Date" → fecha, "Amount" → monto, "Revenue" → ingresos, etc.

- Traducí los nombres de columnas al español normalizado

- Indicá en summary que el documento original estaba en inglés

PARA FACTURAS AFIP:

Extraé siempre estos campos si están presentes:

- numero_comprobante, tipo_comprobante (A/B/C/X/E), fecha_emision, fecha_vencimiento

- razon_social_emisor, cuit_emisor, razon_social_receptor, cuit_receptor

- importe_neto, iva_21, iva_105, otros_impuestos, importe_total

- condicion_venta (contado/cuenta corriente/cuotas), punto_de_venta

PARA REPORTES DE META ADS / GOOGLE ADS:

Extraé siempre: fecha_inicio, fecha_fin, nombre_campaña, inversion (spend), impresiones, clics, ctr, conversiones, costo_por_conversion, roas, alcance

Si hay múltiples niveles (campaña/conjunto/anuncio), extraé el nivel más detallado disponible.

PARA EXTRACTOS BANCARIOS:

Extraé por movimiento: fecha, descripcion, debito, credito, saldo, referencia

ANTI-ALUCINACIÓN — REGLAS ABSOLUTAS:

1. NUNCA inventes datos que no están en el documento. Si no lo ves, no lo ponés.

2. NUNCA completes series de datos faltantes (ej: si faltan meses, no los agregues).

3. NUNCA calcules totales o subtotales que no están explícitos en el documento.

4. NUNCA asumas el año si solo ves "Enero" sin año — poné "Enero" y advertí en warnings.

5. NUNCA redondees precios o cantidades para que "cierren" mejor.

6. Si el documento parece tener datos para 12 meses pero solo ves 10, extraé solo los 10 y mencionalo.

7. Si hay datos que parecen erróneos (ej: ventas negativas, fechas del futuro lejano), extraelos igual y mencionalo en warnings — no los corrijas.

MANEJO DE AMBIGÜEDAD:

- Si no sabés si un valor es monto o cantidad → extraelo como string literal y mencionalo en warnings

- Si una columna podría ser fecha o código → extraela y mencionalo

- Si el documento es de muy baja calidad (imagen borrosa, tabla mal formateada) → extraé lo que puedas y describí las limitaciones en summary

LÍMITES DE EXTRACCIÓN:

- Extraé hasta 500 filas como máximo

- Si hay más de 500 filas, extraé las primeras 500 y mencioná el total real en summary

- Para documentos muy largos, priorizá preservar todas las columnas sobre preservar todas las filas

FORMATO DE RESPUESTA — SOLO JSON:

{"category":"ventas|gastos|stock|facturas|marketing|clientes|rrhh|operaciones|finanzas|otro","confidence":0.95,"summary":"descripción del documento: qué es, período que cubre, cuántas filas, fuente si se puede identificar","row_count":26,"columns":["columna1","columna2"],"data":[{"columna1":"valor1","columna2":"valor2"}],"warnings":["lista de situaciones ambiguas, datos faltantes, o cosas que el usuario debería verificar"],"document_type":"tabla_mensual|factura_individual|reporte_publicitario|extracto_bancario|inventario|otro"}`;

  const JSON_INSTRUCTION = "\n\nRespond with a raw JSON object only. Do not include markdown, code blocks, or any text before or after the JSON. Start your response directly with {";

  const userMessage: unknown = imageBase64 && imageMime
    ? {
        role: "user",
        content: [
          { type: "text", text: `Analizá este archivo "${fileName}". Extraé TODOS los datos numéricos, tablas, y contenido relevante.${metadata ? ` Metadata: ${JSON.stringify(metadata)}` : ''}` },
          { type: "image", source: { type: "base64", media_type: imageMime, data: imageBase64 } },
        ],
      }
    : {
        role: "user",
        content: `Archivo: "${fileName}"\n${metadata ? `Metadata: ${JSON.stringify(metadata)}\n` : ''}\nContenido:\n${content.substring(0, MAX_CONTENT_CHARS)}`,
      };

  const data = await fetchAnthropicWithRetry({
    model: "claude-sonnet-4-5",
    system: systemPrompt + JSON_INSTRUCTION,
    messages: [userMessage],
    temperature: 0.1,
    max_tokens: 4096,
  }, usageCtx ? { ...usageCtx, feature: "file_extraction", metadata: { file_name: fileName, file_upload_id: usageCtx.fileUploadId } } : undefined);

  const raw = (data.content as any)?.[0]?.text || '{}';
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

// ─── Extreme value detection ──────────────────────────────────
const EXTREME_THRESHOLD = 999_999_999_999;

function detectExtremeValues(rows: Record<string, unknown>[]): string[] {
  const extremeValues: string[] = [];
  for (const row of rows) {
    for (const [key, val] of Object.entries(row)) {
      if (typeof val === 'number' && (val > EXTREME_THRESHOLD || val < -EXTREME_THRESHOLD)) {
        extremeValues.push(`${key}: ${val}`);
        if (extremeValues.length >= 10) return extremeValues; // Cap at 10
      }
    }
  }
  return extremeValues;
}

// ─── Semantic row normalization ───────────────────────────────
// Asegura que las filas persistidas usen claves semánticas estables
// (fecha, monto, costo, ganancia, producto, cantidad, etc.) sin importar
// si el archivo original tenía headers genéricos como "__EMPTY", "Unnamed: 0",
// "Total mensual (IVA inc.)" o nombres mapeados por la IA.
const SEMANTIC_FIELD_MAP: Record<string, string[]> = {
  fecha:     ['fecha', 'date', 'mes', 'dia', 'periodo', 'período', '__empty', 'unnamed: 0', 'unnamed:0', 'unnamed_0', 'unnamed', 'f.', 'fecha_operacion', 'fecha_venta', 'fecha_compra'],
  monto:     ['monto', 'total', 'precio de venta', 'precio_de_venta', 'importe', 'total mensual (iva inc.)', 'total mensual', 'valor', 'ventas', 'ingreso', 'facturación', 'facturacion', 'amount', 'subtotal', 'neto'],
  costo:     ['costo', 'cost', 'precio de costo', 'precio_de_costo', 'precio costo', 'costo unitario', 'costo_unitario', 'costo_total'],
  ganancia:  ['ganancia', 'profit', 'margen', 'utilidad', 'resultado'],
  producto:  ['producto', 'product', 'descripcion', 'descripción', 'artículo', 'articulo', 'item', 'nombre', 'detalle', 'concepto'],
  cantidad:  ['cantidad', 'qty', 'unidades', 'units', 'cant.', 'cant', 'cantidad_vendida'],
  stock:     ['stock', 'inventario', 'existencias', 'existencia', 'disponible'],
  categoria: ['categoria', 'categoría', 'category', 'rubro', 'tipo'],
  cliente:   ['cliente', 'client', 'razon_social', 'razón social', 'razon social', 'comprador'],
};

function resolveToSemantic(key: string): string {
  const k = key.toLowerCase().trim();
  for (const [semantic, variants] of Object.entries(SEMANTIC_FIELD_MAP)) {
    if (variants.some(v => k === v || k.startsWith(v))) return semantic;
  }
  return key;
}

function normalizeRow(
  row: Record<string, unknown>,
  columnMapping: Record<string, string | null> = {},
): Record<string, unknown> {
  // Invertir mapping IA: original_header -> semantic
  const inverseAI: Record<string, string> = {};
  for (const [semantic, original] of Object.entries(columnMapping)) {
    if (!original) continue;
    inverseAI[original] = semantic;
    inverseAI[String(original).toLowerCase().trim()] = semantic;
  }

  const out: Record<string, unknown> = {};
  for (const [originalKey, value] of Object.entries(row)) {
    // 1) prioridad: mapping de la IA
    const aiSemantic = inverseAI[originalKey] || inverseAI[String(originalKey).toLowerCase().trim()];
    if (aiSemantic) {
      const norm = resolveToSemantic(aiSemantic);
      // Mantener primer valor no vacío para esa clave semántica
      if (out[norm] === undefined || out[norm] === null || out[norm] === '') out[norm] = value;
      // Conservar también el original por trazabilidad
      out[originalKey] = value;
      continue;
    }
    // 2) fallback: resolver por nombre original
    const norm = resolveToSemantic(originalKey);
    if (norm !== originalKey && (out[norm] === undefined || out[norm] === null || out[norm] === '')) {
      out[norm] = value;
    }
    out[originalKey] = value;
  }
  return out;
}

// ─── Deterministic row storage ────────────────────────────────
async function storeRowBatch(
  sb: ReturnType<typeof createClient>,
  rows: Record<string, unknown>[],
  headers: string[],
  category: string,
  summary: string,
  fileUploadId: string,
  companyId: string,
  batchIndex: number,
  columnMapping?: Record<string, string | null> | null,
): Promise<void> {
  // Delete previous data for this batch (but not metadata)
  const { error: delErr } = await sb.from("file_extracted_data")
    .delete()
    .eq("file_upload_id", fileUploadId)
    .eq("chunk_index", batchIndex);
  if (delErr) console.error(`[process-file] DELETE batch ${batchIndex} error:`, delErr.message);

  // Normalizar filas: agrega claves semánticas (fecha, monto, etc.) sin perder originales
  const normalizedRows = rows.map(r => normalizeRow(r, columnMapping ?? {}));

  const { error: insErr } = await sb.from("file_extracted_data").insert({
    file_upload_id: fileUploadId,
    company_id: companyId,
    data_category: category,
    extracted_json: { columns: headers, data: normalizedRows },
    summary: batchIndex === 0 ? summary : `Lote ${batchIndex + 1}`,
    row_count: normalizedRows.length,
    chunk_index: batchIndex,
  });
  if (insErr) {
    console.error(`[process-file] ❌ INSERT batch ${batchIndex} FAILED:`, insErr.message, insErr.details);
    throw new Error(`Failed to store batch ${batchIndex}: ${insErr.message}`);
  }
  console.log(`[process-file] ✅ Stored batch ${batchIndex} with ${normalizedRows.length} rows (category: ${category})`);
}

// ─── Process structured tabular data (the new deterministic path) ─
async function processTabularData(
  sb: ReturnType<typeof createClient>,
  allRows: Record<string, unknown>[],
  headers: string[],
  fileName: string,
  fileUploadId: string,
  companyId: string,
  sourceSystemHint?: string | null,
): Promise<{ category: string; summary: string; totalRows: number }> {
  console.log(`[process-file] Deterministic tabular processing: ${allRows.length} rows, ${headers.length} columns`);

  const sampleRows = allRows.slice(0, 10);
  const { category, summary, column_mapping } = await classifyWithAI(headers, sampleRows, fileName, undefined, undefined, sourceSystemHint);
  console.log(`[process-file] Classification: category=${category}, mapping keys=${Object.keys(column_mapping).join(',')}`);

  // Apply date normalization using both keywords AND mapped date column
  const mappedDate = column_mapping?.date || null;
  convertSerialDates(allRows, headers, mappedDate);

  // Detect extreme values
  const extremeValues = detectExtremeValues(allRows);
  let finalSummary = summary;
  if (extremeValues.length > 0) {
    const warningMsg = `Se encontraron valores inusualmente grandes que podrían ser errores de datos: ${extremeValues.join(', ')}`;
    console.warn(`[process-file] ⚠️ ${warningMsg}`);
    finalSummary = `${summary}. ⚠️ ${warningMsg}`;
    await sb.from("file_uploads").update({
      processing_error: warningMsg,
    }).eq("id", fileUploadId);
  }

  const totalBatches = Math.ceil(allRows.length / BATCH_SIZE);
  console.log(`[process-file] Storing ${allRows.length} rows in ${totalBatches} batch(es)`);

  // Delete ALL existing data for this file first (clean slate)
  const { error: delAllErr } = await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
  if (delAllErr) console.error(`[process-file] DELETE all error:`, delAllErr.message);

  // Insert column_mapping AFTER delete-all
  const { error: mapErr } = await sb.from("file_extracted_data").insert({
    file_upload_id: fileUploadId,
    company_id: companyId,
    data_category: "_column_mapping",
    extracted_json: { category, column_mapping },
    chunk_index: -1,
    row_count: 0,
  });
  if (mapErr) {
    console.error(`[process-file] ❌ INSERT _column_mapping FAILED:`, mapErr.message);
  } else {
    console.log(`[process-file] ✅ Stored _column_mapping at chunk_index=-1`);
  }

  for (let i = 0; i < totalBatches; i++) {
    const batchRows = allRows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    await storeRowBatch(sb, batchRows, headers, category,
      i === 0 ? `${finalSummary} (${allRows.length} filas en ${totalBatches} lotes)` : finalSummary,
      fileUploadId, companyId, i, column_mapping);
  }

  await sb.from("file_uploads").update({ total_chunks: totalBatches }).eq("id", fileUploadId);

  return { category, summary: finalSummary, totalRows: allRows.length };
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

    const { error: delErr } = await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId).eq("chunk_index", chunk.index);
    if (delErr) console.error(`[process-file] DELETE chunk ${chunk.index} error:`, delErr.message);
    const { error: insErr } = await sb.from("file_extracted_data").insert({
      file_upload_id: fileUploadId, company_id: companyId,
      data_category: result.category, extracted_json: result.data,
      summary: result.summary, row_count: result.rowCount, chunk_index: chunk.index,
    });
    if (insErr) console.error(`[process-file] ❌ INSERT chunk ${chunk.index} FAILED:`, insErr.message);

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

    const rowBatch = body.rowBatch as Record<string, unknown>[] | undefined;
    const headers = body.headers as string[] | undefined;
    const batchIndex = body.batchIndex as number | undefined;
    const totalBatches = body.totalBatches as number | undefined;
    const totalRows = body.totalRows as number | undefined;
    const explicitCategory = body.category as string | undefined;
    const sheetName = body.sheetName as string | undefined;
    // Wave B: when a deterministic local parser handled the headers,
    // CargaDatos sends the mapping (and category) inline so we can skip
    // the AI classification call entirely.
    const precomputedMapping = body.precomputedMapping as Record<string, string | null> | undefined;
    const precomputedSummary = body.precomputedSummary as string | undefined;
    const localParserName = body.localParserName as string | undefined;

    const preParsedData = body.preParsedData;

    console.log(`[process-file] fileUploadId=${fileUploadId}, companyId=${companyId}${sheetName ? `, sheet="${sheetName}"` : ''}`);

    if (!fileUploadId || !companyId) {
      return new Response(JSON.stringify({ error: "Missing fileUploadId or companyId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ola 20: contexto reutilizado en todas las llamadas a Claude
    // para registrar consumo en api_usage_logs.
    const globalUsageCtx = { companyId, userId: null as string | null, fileUploadId };

    const { data: fileRecord, error: fetchErr } = await sb
      .from("file_uploads").select("*").eq("id", fileUploadId).single();
    if (fetchErr || !fileRecord) throw new Error(`File not found: ${fetchErr?.message}`);

    const { file_name, storage_path } = fileRecord;
    // Wave A: optional user-declared origin system. Forwarded to the AI
    // prompt so the model has a strong prior about expected columns.
    const sourceSystemHint: string | null = (fileRecord as any)?.source_system ?? null;
    const ext = file_name.split('.').pop()?.toLowerCase() || '';

    let resultInfo: { category: string; summary: string; totalRows: number };

    // ══════════════════════════════════════════════════════════
    // PATH A: Structured row batch (new deterministic pipeline)
    // ══════════════════════════════════════════════════════════
    if (rowBatch && headers && batchIndex !== undefined && totalBatches !== undefined) {
      if (batchIndex === 0) {
        // First batch: classify with AI — UNLESS a local parser already
        // produced a confident mapping (Wave B). In that case we honor it
        // and skip the AI call entirely (cost win).
        const usageCtx = { companyId, userId: null, fileUploadId };
        let category: string;
        let summary: string;
        let column_mapping: Record<string, string | null>;
        let confidence: number;
        if (precomputedMapping && explicitCategory) {
          category = explicitCategory;
          summary = precomputedSummary || `Procesado localmente con parser ${localParserName || 'determinístico'}.`;
          column_mapping = precomputedMapping;
          confidence = 0.95;
          console.log(`[process-file] Skipping AI classification — using local parser "${localParserName}" mapping (${Object.keys(column_mapping).length} fields)`);
        } else {
          const aiResult = await classifyWithAI(headers, rowBatch.slice(0, 10), file_name, sheetName, usageCtx, sourceSystemHint);
          category = aiResult.category;
          summary = aiResult.summary;
          column_mapping = aiResult.column_mapping;
          confidence = (aiResult as any).confidence ?? 0.8;
        }

        // 5.1: if the user confirmed an explicit category in the Schema
        // Preview dialog, honor it — keep the AI's column_mapping but
        // override the category. Confidence becomes 1.0 (user assertion).
        if (explicitCategory && explicitCategory !== category) {
          console.log(`[process-file] User override: AI classified as "${category}" but user chose "${explicitCategory}"`);
          category = explicitCategory;
          confidence = 1.0;
        }

        // Apply date normalization using mapped date column
        const mappedDate = column_mapping?.date || null;
        const cleanedBatch = cleanRows(rowBatch, headers, mappedDate);
        console.log(`[process-file] Row batch ${batchIndex + 1}/${totalBatches} for "${file_name}" (${rowBatch.length} → ${cleanedBatch.length} rows after cleaning)`);

        // Detect extreme values
        const extremeValues = detectExtremeValues(cleanedBatch);
        if (extremeValues.length > 0) {
          const warningMsg = `Se encontraron valores inusualmente grandes que podrían ser errores de datos: ${extremeValues.join(', ')}`;
          console.warn(`[process-file] ⚠️ ${warningMsg}`);
          summary = `${summary}. ⚠️ ${warningMsg}`;
          await sb.from("file_uploads").update({ processing_error: warningMsg }).eq("id", fileUploadId);
        }

        // Quarantine check
        if (!isMappingAcceptable(column_mapping, category)) {
          console.log(`[process-file] ⚠️ Mapping insufficient for "${file_name}". Triggering re-analysis...`);
          const reMapping = await reAnalyzeMapping(headers, cleanedBatch.slice(0, 20), file_name, category, usageCtx);
          if (isMappingAcceptable(reMapping, category)) {
            console.log(`[process-file] ✅ Re-analysis succeeded for "${file_name}"`);
            column_mapping = reMapping;
          } else {
            console.log(`[process-file] ⚠️ Re-analysis also failed for "${file_name}". Marking for review.`);
            for (const [k, v] of Object.entries(reMapping)) {
              if (v && !column_mapping[k]) column_mapping[k] = v;
            }
            await sb.from("file_uploads").update({
              processing_error: "Requiere revisión: no se identificaron columnas clave automáticamente. Los datos se guardaron. Probá: 1) reprocesar (botón ↻); 2) si sigue, click en \"Asignar columnas\" para mapear manualmente.",
            }).eq("id", fileUploadId);
          }
        }

        // Store classification metadata using upsert (chunk_index -2)
        const { error: classErr } = await sb.from("file_extracted_data").upsert({
          file_upload_id: fileUploadId,
          company_id: companyId,
          data_category: "_classification",
          // 1.10: persist confidence so the LAST batch can apply the same
          // status logic as a single-batch file.
          extracted_json: { category, summary, column_mapping, confidence },
          chunk_index: -2,
          row_count: 0,
        }, { onConflict: 'file_upload_id,chunk_index' });
        if (classErr) {
          console.error(`[process-file] ❌ UPSERT _classification FAILED:`, classErr.message, classErr.details);
        } else {
          console.log(`[process-file] ✅ Stored _classification at chunk_index=-2 (category=${category})`);
        }

        // Store persistent column_mapping using upsert (chunk_index -1)
        const { error: mapErr } = await sb.from("file_extracted_data").upsert({
          file_upload_id: fileUploadId,
          company_id: companyId,
          data_category: "_column_mapping",
          extracted_json: { category, column_mapping },
          chunk_index: -1,
          row_count: 0,
        }, { onConflict: 'file_upload_id,chunk_index' });
        if (mapErr) {
          console.error(`[process-file] ❌ UPSERT _column_mapping FAILED:`, mapErr.message, mapErr.details);
        } else {
          console.log(`[process-file] ✅ Stored _column_mapping at chunk_index=-1`);
        }

        // Store first batch
        await storeRowBatch(sb, cleanedBatch, headers, category,
          `${summary} (${totalRows || cleanedBatch.length} filas)`, fileUploadId, companyId, 0, column_mapping);

        await sb.from("file_uploads").update({
          total_chunks: totalBatches,
          next_chunk_index: 1,
        }).eq("id", fileUploadId);

        if (totalBatches === 1) {
          await sb.from("file_extracted_data").delete()
            .eq("file_upload_id", fileUploadId)
            .eq("data_category", "_classification");
          const { data: flagCheck } = await sb.from("file_uploads").select("processing_error").eq("id", fileUploadId).single();
          let finalStatus: string;
          if (flagCheck?.processing_error?.includes("Requiere revisión")) {
            finalStatus = "review";
          } else if (confidence < 0.4) {
            finalStatus = "processed_with_issues";
            await sb.from("file_uploads").update({ 
              processing_error: `Clasificación con baja confianza (${Math.round(confidence * 100)}%). Revisá el resumen para verificar que los datos se clasificaron correctamente.` 
            }).eq("id", fileUploadId);
          } else {
            finalStatus = "processed";
          }
          await sb.from("file_uploads").update({ status: finalStatus, ...(finalStatus === "processed" ? { processing_error: null } : {}) }).eq("id", fileUploadId);
        }

        return new Response(JSON.stringify({
          success: true, category, summary,
          batchIndex: 0, totalBatches,
          done: totalBatches === 1,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } else {
        // Subsequent batch: clean with mapped date column from classification
        let category = explicitCategory || "";
        let mappedDate: string | null = null;
        let fullMapping: Record<string, string | null> | null = null;

        if (!category) {
          const { data: classData } = await sb.from("file_extracted_data")
            .select("extracted_json")
            .eq("file_upload_id", fileUploadId)
            .eq("data_category", "_classification")
            .single();
          category = (classData?.extracted_json as any)?.category || "otro";
          fullMapping = (classData?.extracted_json as any)?.column_mapping || null;
          mappedDate = fullMapping?.date || null;
        }

        // Also try _column_mapping for date column / full mapping
        if (!mappedDate || !fullMapping) {
          const { data: mapData } = await sb.from("file_extracted_data")
            .select("extracted_json")
            .eq("file_upload_id", fileUploadId)
            .eq("data_category", "_column_mapping")
            .single();
          const mappingFromStore = (mapData?.extracted_json as any)?.column_mapping || null;
          if (!fullMapping) fullMapping = mappingFromStore;
          if (!mappedDate) mappedDate = mappingFromStore?.date || null;
        }

        const cleanedBatch = cleanRows(rowBatch, headers, mappedDate);
        console.log(`[process-file] Row batch ${batchIndex + 1}/${totalBatches} for "${file_name}" (${rowBatch.length} → ${cleanedBatch.length} rows after cleaning)`);

        await storeRowBatch(sb, cleanedBatch, headers, category,
          `Lote ${batchIndex + 1}/${totalBatches}`, fileUploadId, companyId, batchIndex, fullMapping);

        await sb.from("file_uploads").update({
          next_chunk_index: batchIndex + 1,
        }).eq("id", fileUploadId);

        const isLast = batchIndex === totalBatches - 1;
        if (isLast) {
          // 1.10: read persisted confidence BEFORE deleting _classification so
          // we can apply the same low-confidence flagging as single-batch files.
          const { data: classRead } = await sb.from("file_extracted_data")
            .select("extracted_json")
            .eq("file_upload_id", fileUploadId)
            .eq("data_category", "_classification")
            .maybeSingle();
          const persistedConfidence = (classRead?.extracted_json as any)?.confidence;

          await sb.from("file_extracted_data").delete()
            .eq("file_upload_id", fileUploadId)
            .eq("data_category", "_classification");
          const { data: flagCheck } = await sb.from("file_uploads").select("processing_error").eq("id", fileUploadId).single();
          let finalStatus: string;
          if (flagCheck?.processing_error?.includes("Requiere revisión")) {
            finalStatus = "review";
          } else if (typeof persistedConfidence === 'number' && persistedConfidence < 0.4) {
            finalStatus = "processed_with_issues";
            await sb.from("file_uploads").update({
              processing_error: `Clasificación con baja confianza (${Math.round(persistedConfidence * 100)}%). Revisá el resumen para verificar que los datos se clasificaron correctamente.`
            }).eq("id", fileUploadId);
          } else {
            finalStatus = "processed";
          }
          await sb.from("file_uploads").update({ status: finalStatus, ...(finalStatus === "processed" ? { processing_error: null } : {}) }).eq("id", fileUploadId);
          console.log(`[process-file] ✅ All ${totalBatches} batches stored for "${file_name}" (status: ${finalStatus}, confidence: ${persistedConfidence ?? 'n/a'})`);
        }

        return new Response(JSON.stringify({
          success: true, category,
          batchIndex, totalBatches,
          done: isLast,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ══════════════════════════════════════════════════════════
    // PATH B: Legacy preParsedData
    // ══════════════════════════════════════════════════════════
    if (preParsedData) {
      const content = typeof preParsedData === 'string' ? preParsedData : JSON.stringify(preParsedData);
      const rows = parseCSV(content);
      if (rows.length > 0) {
        const parsedHeaders = Object.keys(rows[0]);
        console.log(`[process-file] Legacy preParsed → parsed ${rows.length} rows, using deterministic path`);
        resultInfo = await processTabularData(sb, rows, parsedHeaders, file_name, fileUploadId, companyId, sourceSystemHint);
      } else {
        console.log(`[process-file] Legacy preParsed → could not parse rows, using AI extraction`);
        const result = await extractWithAI(content.substring(0, MAX_CONTENT_CHARS), file_name, undefined, undefined, undefined, globalUsageCtx);
        { const { error: d } = await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
          if (d) console.error('[process-file] DELETE error:', d.message);
          const { error: e } = await sb.from("file_extracted_data").insert({
            file_upload_id: fileUploadId, company_id: companyId,
            data_category: result.category, extracted_json: result.data,
            summary: result.summary, row_count: result.rowCount, chunk_index: 0,
          });
          if (e) console.error('[process-file] ❌ INSERT FAILED:', e.message);
          else console.log('[process-file] ✅ Stored AI extraction at chunk_index=0'); }
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
      const { text, encodingWarning } = detectAndFixEncoding(buffer);
      let allRows = parseCSV(text);
      console.log(`[process-file] CSV parsed: ${allRows.length} rows${encodingWarning ? ' (encoding warning)' : ''}`);

      if (allRows.length > 0) {
        const fixed = fixBrokenHeaders(allRows);
        allRows = cleanRows(fixed.rows, fixed.headers.length > 0 ? fixed.headers : Object.keys(allRows[0]));
        const parsedHeaders = fixed.headers.length > 0 ? fixed.headers : Object.keys(allRows[0]);
        resultInfo = await processTabularData(sb, allRows, parsedHeaders, file_name, fileUploadId, companyId, sourceSystemHint);
      } else {
        const result = await extractWithAI(text.substring(0, MAX_CONTENT_CHARS), file_name, undefined, undefined, undefined, globalUsageCtx);
        { const { error: d } = await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
          if (d) console.error('[process-file] DELETE error:', d.message);
          const { error: e } = await sb.from("file_extracted_data").insert({
            file_upload_id: fileUploadId, company_id: companyId,
            data_category: result.category, extracted_json: result.data,
            summary: result.summary, row_count: result.rowCount, chunk_index: 0,
          });
          if (e) console.error('[process-file] ❌ INSERT FAILED:', e.message);
          else console.log('[process-file] ✅ Stored AI extraction at chunk_index=0'); }
        resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
      }

    // ─── Excel: Deterministic if possible ────────────────────
    } else if (['xls', 'xlsx'].includes(ext)) {
      const parseExcel = () => {
        const wb = XLSX.read(bytes, { type: 'array', dense: true, cellStyles: false, cellNF: false, cellText: false, sheetRows: MAX_EXCEL_ROWS });
        const allRows: Record<string, unknown>[] = [];
        let primaryHeaders: string[] = [];
        const skippedSheets: string[] = [];

        for (const sName of wb.SheetNames) {
          const sheet = wb.Sheets[sName];
          if (!sheet) continue;
          const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
          if (sheetRows.length === 0) continue;

          const sheetHeaders = Object.keys(sheetRows[0]);

          if (primaryHeaders.length === 0) {
            // First non-empty sheet defines the primary structure
            primaryHeaders = sheetHeaders;
            allRows.push(...sheetRows);
            console.log(`[process-file] Excel primary sheet "${sName}": ${sheetHeaders.length} cols, ${sheetRows.length} rows`);
          } else {
            // Only merge sheets with compatible headers (same column set, order may differ)
            const sheetSet = new Set(sheetHeaders);
            const compatible = sheetHeaders.length === primaryHeaders.length &&
              primaryHeaders.every(h => sheetSet.has(h));
            if (compatible) {
              allRows.push(...sheetRows);
              console.log(`[process-file] Excel sheet "${sName}": compatible, merged ${sheetRows.length} rows`);
            } else {
              skippedSheets.push(sName);
              console.warn(`[process-file] Excel sheet "${sName}": incompatible columns (${sheetHeaders.slice(0, 5).join(', ')}...) — skipped to avoid data corruption`);
            }
          }

          if (allRows.length >= MAX_EXCEL_ROWS) break;
        }

        if (skippedSheets.length > 0) {
          console.warn(`[process-file] ⚠️ Skipped ${skippedSheets.length} sheet(s) with different structure: ${skippedSheets.join(', ')}`);
        }
        if (allRows.length > MAX_EXCEL_ROWS) allRows.length = MAX_EXCEL_ROWS;
        return { allRows, headers: primaryHeaders };
      };

      if (buffer.byteLength > MAX_EXCEL_FILE_SIZE) {
        const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(1);
        console.warn(`[process-file] Excel too large: ${sizeMB}MB`);
        try {
          const { allRows, headers } = parseExcel();
          if (allRows.length > 0) {
            const fixed = fixBrokenHeaders(allRows);
            const cleaned = cleanRows(fixed.rows, fixed.headers.length > 0 ? fixed.headers : headers);
            resultInfo = await processTabularData(sb, cleaned, fixed.headers.length > 0 ? fixed.headers : headers, file_name, fileUploadId, companyId, sourceSystemHint);
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
        try {
          const { allRows, headers } = parseExcel();
          if (allRows.length > 0) {
            const fixed = fixBrokenHeaders(allRows);
            const cleaned = cleanRows(fixed.rows, fixed.headers.length > 0 ? fixed.headers : headers);
            resultInfo = await processTabularData(sb, cleaned, fixed.headers.length > 0 ? fixed.headers : headers, file_name, fileUploadId, companyId, sourceSystemHint);
          } else {
            const wb = XLSX.read(bytes, { type: 'array' });
            const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ',', RS: '\n' });
            const result = await extractWithAI(csv.substring(0, MAX_CONTENT_CHARS), file_name, undefined, undefined, undefined, globalUsageCtx);
            { const { error: d } = await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
              if (d) console.error('[process-file] DELETE error:', d.message);
              const { error: e } = await sb.from("file_extracted_data").insert({
                file_upload_id: fileUploadId, company_id: companyId,
                data_category: result.category, extracted_json: result.data,
                summary: result.summary, row_count: result.rowCount, chunk_index: 0,
              });
              if (e) console.error('[process-file] ❌ INSERT FAILED:', e.message);
              else console.log('[process-file] ✅ Stored AI extraction at chunk_index=0'); }
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

      const result = await extractWithAI(content, file_name, imageBase64, imageMime, processingMetadata, globalUsageCtx);
      { const { error: d } = await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
        if (d) console.error('[process-file] DELETE error:', d.message);
        const { error: e } = await sb.from("file_extracted_data").insert({
          file_upload_id: fileUploadId, company_id: companyId,
          data_category: result.category, extracted_json: result.data,
          summary: result.summary, row_count: result.rowCount, chunk_index: 0,
        });
        if (e) console.error('[process-file] ❌ INSERT FAILED:', e.message);
        else console.log('[process-file] ✅ Stored AI extraction at chunk_index=0'); }
      resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };

    // ─── PDF ────────────────────────────────────────────────
    } else if (ext === 'pdf') {
      const pdfResult = await extractPdfText(buffer);
      const processingMetadata: Record<string, unknown> = { method: pdfResult.method, pages: pdfResult.pages };

      if (pdfResult.method === 'text_extraction' && pdfResult.text.length > 50) {
        const pdfRows = parseCSV(pdfResult.text);
        if (pdfRows.length > 10) {
          const pdfHeaders = Object.keys(pdfRows[0]);
          resultInfo = await processTabularData(sb, pdfRows, pdfHeaders, file_name, fileUploadId, companyId, sourceSystemHint);
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
          const result = await extractWithAI(content, file_name, undefined, undefined, processingMetadata, globalUsageCtx);
          { const { error: d } = await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
            if (d) console.error('[process-file] DELETE error:', d.message);
            const { error: e } = await sb.from("file_extracted_data").insert({
              file_upload_id: fileUploadId, company_id: companyId,
              data_category: result.category, extracted_json: result.data,
              summary: result.summary, row_count: result.rowCount, chunk_index: 0,
            });
            if (e) console.error('[process-file] ❌ INSERT FAILED:', e.message);
            else console.log('[process-file] ✅ Stored AI extraction at chunk_index=0'); }
          resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
        }
      } else {
        let content: string;
        if (buffer.byteLength <= MAX_IMAGE_BYTES) {
          content = `[PDF escaneado - ${pdfResult.pages} páginas. Texto parcial: "${pdfResult.text.substring(0, 2000)}". Nombre: "${file_name}".]`;
        } else {
          content = `[PDF muy grande (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). Texto parcial: "${pdfResult.text.substring(0, 1000)}". Nombre: "${file_name}".]`;
        }
        const result = await extractWithAI(content, file_name, undefined, undefined, processingMetadata, globalUsageCtx);
        { const { error: d } = await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
          if (d) console.error('[process-file] DELETE error:', d.message);
          const { error: e } = await sb.from("file_extracted_data").insert({
            file_upload_id: fileUploadId, company_id: companyId,
            data_category: result.category, extracted_json: result.data,
            summary: result.summary, row_count: result.rowCount, chunk_index: 0,
          });
          if (e) console.error('[process-file] ❌ INSERT FAILED:', e.message);
          else console.log('[process-file] ✅ Stored AI extraction at chunk_index=0'); }
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
      const result = await extractWithAI(content, file_name, undefined, undefined, undefined, globalUsageCtx);
      { const { error: d } = await sb.from("file_extracted_data").delete().eq("file_upload_id", fileUploadId);
        if (d) console.error('[process-file] DELETE error:', d.message);
        const { error: e } = await sb.from("file_extracted_data").insert({
          file_upload_id: fileUploadId, company_id: companyId,
          data_category: result.category, extracted_json: result.data,
          summary: result.summary, row_count: result.rowCount, chunk_index: 0,
        });
        if (e) console.error('[process-file] ❌ INSERT FAILED:', e.message);
        else console.log('[process-file] ✅ Stored AI extraction at chunk_index=0'); }
      resultInfo = { category: result.category, summary: result.summary, totalRows: result.rowCount };
    }

    // Determine final status: processed_with_issues if zero rows or encoding problems
    let finalStatus = "processed";
    let finalError: string | null = null;

    if (resultInfo.totalRows === 0) {
      finalStatus = "processed_with_issues";
      finalError = "No se encontraron datos tabulares en este archivo. Revisá el resumen para más detalles.";
    }

    // Check for encoding warnings (only for CSV/TXT in PATH C)
    if (['csv', 'txt'].includes(ext)) {
      const { encodingWarning } = detectAndFixEncoding(buffer);
      if (encodingWarning && finalStatus === "processed") {
        finalStatus = "processed_with_issues";
        finalError = encodingWarning;
      }
    }

    await sb.from("file_uploads").update({ 
      status: finalStatus, 
      processing_error: finalError,
    }).eq("id", fileUploadId);
    console.log(`[process-file] ✅ Completed "${file_name}" - category=${resultInfo.category}, rows=${resultInfo.totalRows}, status=${finalStatus}`);

    return new Response(JSON.stringify({
      success: true, ...resultInfo, status: finalStatus,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[process-file] ❌ Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (fileUploadId) {
      try {
        if (error instanceof RateLimitError) {
          console.log(`[process-file] Rate limited — requeueing ${fileUploadId}`);
          await sb.from("file_uploads").update({
            status: "queued",
            processing_error: RATE_LIMIT_MESSAGE,
            processing_started_at: null,
          }).eq("id", fileUploadId);
        } else {
          await sb.from("file_uploads").update({ status: "error", processing_error: msg }).eq("id", fileUploadId);
        }
      } catch { /* ignore */ }
    }
    return new Response(JSON.stringify({ error: msg, rateLimited: error instanceof RateLimitError }), {
      status: error instanceof RateLimitError ? 429 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
