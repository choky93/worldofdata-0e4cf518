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

async function fetchOpenAIWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const resp = await fetch(url, init);
    if (resp.ok) return resp;
    if ((resp.status === 429 || resp.status === 503) && attempt < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[attempt];
      console.warn(`[process-file] OpenAI ${resp.status}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS.length})`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    if (resp.status === 429 || resp.status === 503) {
      throw new RateLimitError(`OpenAI rate limit after ${RETRY_DELAYS.length} retries [${resp.status}]`);
    }
    const errText = await resp.text();
    throw new Error(`OpenAI error [${resp.status}]: ${errText}`);
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
  const dateHeaders = new Set(headers.filter(h => DATE_KW.some(kw => norm(h).includes(kw))));
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
  return rows.filter(row => {
    const allEmpty = nameHeaders.every(h => {
      const v = row[h];
      return v === undefined || v === null || String(v ?? '').trim() === '';
    });
    if (!allEmpty) return true;
    const hasNum = Object.values(row).some(v => typeof v === 'number' && v > 0);
    if (hasNum) { console.log(`[process-file] Filtered summary row`); return false; }
    return true;
  });
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

// ─── AI Classification (lightweight — headers + sample only) ──
async function classifyWithAI(
  headers: string[],
  sampleRows: Record<string, unknown>[],
  fileName: string,
): Promise<{ category: string; summary: string; column_mapping: Record<string, string | null> }> {
  console.log(`[process-file] AI classification for "${fileName}" (${headers.length} cols, ${sampleRows.length} sample rows)`);

  const systemPrompt = `Sos un especialista en análisis de datos de PyMEs latinoamericanas. Tu tarea es clasificar archivos de datos de negocios y mapear sus columnas a campos semánticos estándar.

ROL: Actuás como un contador/analista de datos experto en empresas argentinas. Conocés todos los formatos de archivos que usan las PyMEs: desde Excel prolijo hasta CSVs exportados de sistemas de gestión, reportes de Meta Ads, informes de stock de depósito, y resúmenes de ventas hechos a mano.

TAREA: Dado un archivo con sus columnas y filas de ejemplo, determiná:

1. A qué categoría de datos corresponde

2. Qué columna del archivo original corresponde a cada campo semántico

CATEGORÍAS DISPONIBLES:

- "ventas": registros de ventas, facturación, ingresos, pedidos, transacciones

- "gastos": egresos, costos, pagos realizados, facturas de proveedores, gastos operativos

- "stock": inventario, productos, unidades, depósito, mercadería

- "facturas": comprobantes de venta o compra individuales (AFIP, factura A/B/C, remito)

- "marketing": inversión publicitaria, Meta Ads, Google Ads, campañas, métricas de performance

- "clientes": base de clientes, compradores, deudores, cuentas corrientes

- "rrhh": empleados, sueldos, liquidaciones, personal

- "operaciones": compras a proveedores, logística, envíos, recepciones de mercadería

- "finanzas": flujo de caja, movimientos bancarios, extractos, presupuesto financiero

- "otro": no encaja claramente en ninguna categoría anterior

CAMPOS SEMÁNTICOS POR CATEGORÍA:

- ventas: {"amount":"monto total de venta","date":"fecha de la venta","name":"descripción o producto","client":"nombre del cliente","category":"rubro o línea de producto","quantity":"cantidad vendida","unit_price":"precio unitario","tax":"impuesto o IVA","payment_method":"forma de pago","invoice_number":"número de comprobante"}

- gastos: {"amount":"monto del gasto","date":"fecha","name":"descripción del gasto","category":"tipo de gasto","status":"estado (pagado/pendiente)","supplier":"proveedor","payment_method":"forma de pago"}

- marketing: {"spend":"monto invertido","date":"fecha o período","campaign_name":"nombre de campaña","platform":"plataforma (Meta/Google/etc)","clicks":"clics","impressions":"impresiones","conversions":"conversiones","reach":"alcance","roas":"retorno sobre inversión publicitaria","ctr":"tasa de clics","revenue":"ingresos atribuidos"}

- stock: {"name":"nombre del producto","quantity":"unidades en stock","price":"precio de venta","cost":"costo de compra","min_stock":"stock mínimo","category":"categoría del producto","sku":"código de producto","supplier":"proveedor"}

- facturas: {"amount":"monto total","date":"fecha de emisión","name":"descripción","client":"cliente o proveedor","number":"número de factura","tax":"IVA","net_amount":"monto neto","due_date":"fecha de vencimiento","type":"tipo A/B/C/X"}

- clientes: {"name":"nombre del cliente","total_purchases":"total comprado","debt":"deuda pendiente","last_purchase":"última compra","purchase_count":"cantidad de compras","email":"email","phone":"teléfono","category":"segmento o tipo de cliente"}

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

REGLAS ANTI-ALUCINACIÓN — CRÍTICO:

1. NUNCA inventes una columna que no existe en los headers reales del archivo.

2. Si no hay ninguna columna que razonablemente corresponda a un campo semántico, poné null. Es mejor null que un mapeo incorrecto.

3. Si una columna podría corresponder a dos campos, elegí el más probable y mencionalo en el summary.

4. Si el archivo es ambiguo y podría ser de dos categorías distintas, elegí la más probable y explicalo en summary.

5. Si el archivo tiene muy pocas columnas o datos insuficientes para clasificar con confianza, usá category "otro" y explicá en summary.

CONFIDENCE SCORE:

Incluí en el JSON un campo "confidence" con valor entre 0 y 1 indicando tu nivel de certeza en la clasificación. Si confidence < 0.6, explicá detalladamente en summary qué es lo que no está claro.

FORMATO DE RESPUESTA — SOLO JSON:

{"category":"...","confidence":0.95,"summary":"descripción breve del archivo y qué contiene","column_mapping":{"amount":"Nombre Exacto Columna","date":"Nombre Exacto Columna",...},"warnings":["lista de advertencias si hay datos ambiguos o columnas que no se pudieron mapear con certeza"]}`;

  const content = `Archivo: "${fileName}"
Columnas: ${JSON.stringify(headers)}
Primeras ${sampleRows.length} filas de ejemplo:
${JSON.stringify(sampleRows.slice(0, 10), null, 2)}`;

  const resp = await fetchOpenAIWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 512,
    }),
  });

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(raw);
    return {
      category: parsed.category || "otro",
      summary: parsed.summary || "Sin resumen",
      column_mapping: parsed.column_mapping || {},
    };
  } catch {
    return { category: "otro", summary: "No se pudo clasificar", column_mapping: {} };
  }
}


// ─── Quarantine: Re-analysis with detailed prompt ─────────────
async function reAnalyzeMapping(
  headers: string[],
  sampleRows: Record<string, unknown>[],
  fileName: string,
  originalCategory: string,
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

  const resp = await fetchOpenAIWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 0.05,
      max_tokens: 512,
    }),
  });

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(raw);
    return parsed.column_mapping || {};
  } catch {
    return {};
  }
}

function isMappingAcceptable(mapping: Record<string, string | null>, category: string): boolean {
  const amountKeys = ['amount', 'spend', 'salary', 'quantity', 'total_purchases', 'price'];
  const dateKeys = ['date', 'last_purchase'];

  const hasAmount = amountKeys.some(k => mapping[k] != null);
  const hasDate = dateKeys.some(k => mapping[k] != null);

  if (category === 'stock') return hasAmount || mapping['name'] != null;
  if (category === 'clientes') return hasAmount || mapping['name'] != null;

  return hasAmount || hasDate;
}


async function extractWithAI(
  content: string,
  fileName: string,
  imageBase64?: string,
  imageMime?: string,
  metadata?: Record<string, unknown>
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

  const resp = await fetchOpenAIWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

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
  // Delete previous data for this batch (but not metadata)
  const { error: delErr } = await sb.from("file_extracted_data")
    .delete()
    .eq("file_upload_id", fileUploadId)
    .eq("chunk_index", batchIndex);
  if (delErr) console.error(`[process-file] DELETE batch ${batchIndex} error:`, delErr.message);

  const { error: insErr } = await sb.from("file_extracted_data").insert({
    file_upload_id: fileUploadId,
    company_id: companyId,
    data_category: category,
    extracted_json: { columns: headers, data: rows },
    summary: batchIndex === 0 ? summary : `Lote ${batchIndex + 1}`,
    row_count: rows.length,
    chunk_index: batchIndex,
  });
  if (insErr) {
    console.error(`[process-file] ❌ INSERT batch ${batchIndex} FAILED:`, insErr.message, insErr.details);
    throw new Error(`Failed to store batch ${batchIndex}: ${insErr.message}`);
  }
  console.log(`[process-file] ✅ Stored batch ${batchIndex} with ${rows.length} rows (category: ${category})`);
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

  const sampleRows = allRows.slice(0, 10);
  const { category, summary, column_mapping } = await classifyWithAI(headers, sampleRows, fileName);
  console.log(`[process-file] Classification: category=${category}, mapping keys=${Object.keys(column_mapping).join(',')}`);

  // Apply date normalization using both keywords AND mapped date column
  const mappedDate = column_mapping?.date || null;
  convertSerialDates(allRows, headers, mappedDate);

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
      i === 0 ? `${summary} (${allRows.length} filas en ${totalBatches} lotes)` : summary,
      fileUploadId, companyId, i);
  }

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
      if (batchIndex === 0) {
        // First batch: classify with AI
        let { category, summary, column_mapping } = await classifyWithAI(headers, rowBatch.slice(0, 10), file_name);

        // Apply date normalization using mapped date column
        const mappedDate = column_mapping?.date || null;
        const cleanedBatch = cleanRows(rowBatch, headers, mappedDate);
        console.log(`[process-file] Row batch ${batchIndex + 1}/${totalBatches} for "${file_name}" (${rowBatch.length} → ${cleanedBatch.length} rows after cleaning)`);

        // Quarantine check
        if (!isMappingAcceptable(column_mapping, category)) {
          console.log(`[process-file] ⚠️ Mapping insufficient for "${file_name}". Triggering re-analysis...`);
          const reMapping = await reAnalyzeMapping(headers, cleanedBatch.slice(0, 20), file_name, category);
          if (isMappingAcceptable(reMapping, category)) {
            console.log(`[process-file] ✅ Re-analysis succeeded for "${file_name}"`);
            column_mapping = reMapping;
          } else {
            console.log(`[process-file] ⚠️ Re-analysis also failed for "${file_name}". Marking for review.`);
            for (const [k, v] of Object.entries(reMapping)) {
              if (v && !column_mapping[k]) column_mapping[k] = v;
            }
            await sb.from("file_uploads").update({
              processing_error: "Requiere revisión: no se detectaron campos clave (monto/fecha). Los datos se guardaron pero pueden necesitar ajuste manual.",
            }).eq("id", fileUploadId);
          }
        }

        // Store classification metadata using upsert (chunk_index -2)
        const { error: classErr } = await sb.from("file_extracted_data").upsert({
          file_upload_id: fileUploadId,
          company_id: companyId,
          data_category: "_classification",
          extracted_json: { category, summary, column_mapping },
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
          `${summary} (${totalRows || cleanedBatch.length} filas)`, fileUploadId, companyId, 0);

        await sb.from("file_uploads").update({
          total_chunks: totalBatches,
          next_chunk_index: 1,
        }).eq("id", fileUploadId);

        if (totalBatches === 1) {
          await sb.from("file_extracted_data").delete()
            .eq("file_upload_id", fileUploadId)
            .eq("data_category", "_classification");
          const { data: flagCheck } = await sb.from("file_uploads").select("processing_error").eq("id", fileUploadId).single();
          const finalStatus = flagCheck?.processing_error?.includes("Requiere revisión") ? "review" : "processed";
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

        if (!category) {
          const { data: classData } = await sb.from("file_extracted_data")
            .select("extracted_json")
            .eq("file_upload_id", fileUploadId)
            .eq("data_category", "_classification")
            .single();
          category = (classData?.extracted_json as any)?.category || "otro";
          mappedDate = (classData?.extracted_json as any)?.column_mapping?.date || null;
        }

        // Also try _column_mapping for date column
        if (!mappedDate) {
          const { data: mapData } = await sb.from("file_extracted_data")
            .select("extracted_json")
            .eq("file_upload_id", fileUploadId)
            .eq("data_category", "_column_mapping")
            .single();
          mappedDate = (mapData?.extracted_json as any)?.column_mapping?.date || null;
        }

        const cleanedBatch = cleanRows(rowBatch, headers, mappedDate);
        console.log(`[process-file] Row batch ${batchIndex + 1}/${totalBatches} for "${file_name}" (${rowBatch.length} → ${cleanedBatch.length} rows after cleaning)`);

        await storeRowBatch(sb, cleanedBatch, headers, category,
          `Lote ${batchIndex + 1}/${totalBatches}`, fileUploadId, companyId, batchIndex);

        await sb.from("file_uploads").update({
          next_chunk_index: batchIndex + 1,
        }).eq("id", fileUploadId);

        const isLast = batchIndex === totalBatches - 1;
        if (isLast) {
          await sb.from("file_extracted_data").delete()
            .eq("file_upload_id", fileUploadId)
            .eq("data_category", "_classification");
          const { data: flagCheck } = await sb.from("file_uploads").select("processing_error").eq("id", fileUploadId).single();
          const finalStatus = flagCheck?.processing_error?.includes("Requiere revisión") ? "review" : "processed";
          await sb.from("file_uploads").update({ status: finalStatus, ...(finalStatus === "processed" ? { processing_error: null } : {}) }).eq("id", fileUploadId);
          console.log(`[process-file] ✅ All ${totalBatches} batches stored for "${file_name}" (status: ${finalStatus})`);
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
        resultInfo = await processTabularData(sb, rows, parsedHeaders, file_name, fileUploadId, companyId);
      } else {
        console.log(`[process-file] Legacy preParsed → could not parse rows, using AI extraction`);
        const result = await extractWithAI(content.substring(0, MAX_CONTENT_CHARS), file_name);
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
      const text = new TextDecoder().decode(buffer);
      let allRows = parseCSV(text);
      console.log(`[process-file] CSV parsed: ${allRows.length} rows`);

      if (allRows.length > 0) {
        const fixed = fixBrokenHeaders(allRows);
        allRows = cleanRows(fixed.rows, fixed.headers.length > 0 ? fixed.headers : Object.keys(allRows[0]));
        const parsedHeaders = fixed.headers.length > 0 ? fixed.headers : Object.keys(allRows[0]);
        resultInfo = await processTabularData(sb, allRows, parsedHeaders, file_name, fileUploadId, companyId);
      } else {
        const result = await extractWithAI(text.substring(0, MAX_CONTENT_CHARS), file_name);
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
        return { allRows, headers };
      };

      if (buffer.byteLength > MAX_EXCEL_FILE_SIZE) {
        const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(1);
        console.warn(`[process-file] Excel too large: ${sizeMB}MB`);
        try {
          const { allRows, headers } = parseExcel();
          if (allRows.length > 0) {
            const fixed = fixBrokenHeaders(allRows);
            const cleaned = cleanRows(fixed.rows, fixed.headers.length > 0 ? fixed.headers : headers);
            resultInfo = await processTabularData(sb, cleaned, fixed.headers.length > 0 ? fixed.headers : headers, file_name, fileUploadId, companyId);
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
            resultInfo = await processTabularData(sb, cleaned, fixed.headers.length > 0 ? fixed.headers : headers, file_name, fileUploadId, companyId);
          } else {
            const wb = XLSX.read(bytes, { type: 'array' });
            const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ',', RS: '\n' });
            const result = await extractWithAI(csv.substring(0, MAX_CONTENT_CHARS), file_name);
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

      const result = await extractWithAI(content, file_name, imageBase64, imageMime, processingMetadata);
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
        const result = await extractWithAI(content, file_name, undefined, undefined, processingMetadata);
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
      const result = await extractWithAI(content, file_name);
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
