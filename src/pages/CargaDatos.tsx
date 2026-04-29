import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Image, FileSpreadsheet, Trash2, Lightbulb, Loader2, RefreshCw, CheckCircle2, Search, ChevronLeft, ChevronRight, Filter, XCircle, BarChart3, Clock, AlertTriangle, Layers, Link2, ArrowUp, Globe, Package, Pencil, X as XIcon, Download, Archive, RotateCcw, History } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/formatters';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { cleanParsedRows, cleanParsedRowsWithStats, detectPeriodOverlap, parseDate } from '@/lib/data-cleaning';
import { useExtractedData } from '@/hooks/useExtractedData';
import { findString, FIELD_DATE, FIELD_NAME } from '@/lib/field-utils';
import { SchemaPreviewDialog, type SchemaPreviewPayload } from '@/components/SchemaPreviewDialog';
import { MultiSheetPickerDialog, type SheetInfo } from '@/components/MultiSheetPickerDialog';
import { useDeleteRequests } from '@/hooks/useDeleteRequests';
import { suggestCategory } from '@/lib/schema-preview';
import { DataQualityBadge } from '@/components/DataQualityBadge';
import { computeDataQuality, detectAnomalies, type DataQualityScore } from '@/lib/data-quality';
import { computeVersionDiff, type VersionDiff } from '@/lib/version-diff';
import { TEMPLATES, downloadTemplate } from '@/lib/templates';
import { AuditTrailPanel } from '@/components/AuditTrailPanel';
import { getStaleThresholdDays } from '@/lib/user-settings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';


interface FileRecord {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  status: string | null;
  storage_path: string | null;
  uploaded_by: string | null;
  created_at: string | null;
  company_id: string;
  file_hash?: string | null;
  processing_error?: string | null;
  processing_started_at?: string | null;
  next_chunk_index?: number | null;
  total_chunks?: number | null;
}

interface ExtractedData {
  file_upload_id: string;
  data_category: string;
  summary: string | null;
  row_count: number | null;
  chunk_index: number;
}

interface SheetStatus {
  name: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  rows?: number;
}

interface UploadQueueItem {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
  currentChunk?: number;
  totalChunks?: number;
  totalRows?: number;
  processedRows?: number;
  chunksFailed?: number;
  sheetStatuses?: SheetStatus[];
}

const fileIcons: Record<string, typeof FileText> = { PDF: FileText, CSV: FileSpreadsheet, XLS: FileSpreadsheet, Imagen: Image };

const PAGE_SIZE = 25;
const MAX_CONCURRENT_UPLOADS = 4;
const PRESIGN_THRESHOLD = 20 * 1024 * 1024; // 20MB

// B3: Human-readable labels for semantic column keys
// 2.6: Module mapping moved to src/lib/category-modules.ts (single source of truth).
// We re-export the legacy shape (string label arrays) here for the existing UI.
import { CATEGORY_MODULES as CAT_MODS_KEYS, MODULES as MOD_INFO } from '@/lib/category-modules';
const CATEGORY_MODULES: Record<string, string[]> = Object.fromEntries(
  Object.entries(CAT_MODS_KEYS).map(([cat, mods]) => [cat, mods.map(m => MOD_INFO[m].label)])
);

// C4+: Panel de frescura de datos por categoría
function FreshnessPanel({ lastUploadDates }: { lastUploadDates: Record<string, string> }) {
  const entries = Object.entries(lastUploadDates).filter(([, d]) => !!d);
  if (entries.length === 0) return null;

  const categoryName: Record<string, string> = {
    ventas: 'Ventas', gastos: 'Gastos', stock: 'Stock',
    marketing: 'Marketing', clientes: 'Clientes', facturas: 'Finanzas',
    rrhh: 'RRHH', otro: 'Otro',
  };
  const categoryEmoji: Record<string, string> = {
    ventas: '📊', gastos: '💰', stock: '📦',
    marketing: '📈', clientes: '👥', facturas: '🧾',
    rrhh: '👔', otro: '📄',
  };

  const now = Date.now();
  const MAX_DAYS = 90;

  return (
    <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-muted/30 via-muted/10 to-transparent p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-1.5 w-1.5 rounded-full bg-primary/50" />
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Frescura de datos</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {entries.map(([cat, dateStr]) => {
          const days = Math.max(0, Math.floor((now - new Date(dateStr).getTime()) / 86400000));
          const isGood = days < 35;
          const isWarn = !isGood && days < 65;
          const isStale = !isGood && !isWarn;
          const pct = Math.min(100, Math.round((days / MAX_DAYS) * 100));
          const label = days === 0 ? 'Hoy' : days === 1 ? 'Ayer' : `Hace ${days}d`;

          const borderClass = isGood
            ? 'border-success/25 bg-success/5'
            : isWarn
            ? 'border-warning/25 bg-warning/5'
            : 'border-destructive/25 bg-destructive/5';
          const dotClass = isGood ? 'bg-success' : isWarn ? 'bg-warning' : 'bg-destructive';
          const barClass = isGood ? 'bg-success' : isWarn ? 'bg-warning' : 'bg-destructive';
          const textClass = isGood ? 'text-success' : isWarn ? 'text-warning' : 'text-destructive';

          return (
            <div key={cat} className={`relative rounded-xl p-3 border ${borderClass}`}>
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm leading-none">{categoryEmoji[cat] || '📄'}</span>
                  <span className="text-[11px] font-semibold leading-none">{categoryName[cat] || cat}</span>
                </div>
                <span className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${dotClass} ${isStale ? 'animate-pulse' : ''}`} />
              </div>
              <p className={`text-[11px] font-bold ${textClass}`}>{label}</p>
              <div className="mt-2 h-0.5 rounded-full bg-border/30 overflow-hidden">
                <div
                  className={`h-full rounded-full ${barClass} transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SEMANTIC_LABELS: Record<string, string> = {
  amount: 'Monto', date: 'Fecha', name: 'Nombre/Desc.', client: 'Cliente',
  category: 'Categoría', quantity: 'Cantidad', unit_price: 'P. Unitario',
  cost: 'Costo', profit: 'Ganancia', tax: 'Impuesto',
  payment_method: 'Forma pago', invoice_number: 'N° Comp.',
  spend: 'Inversión', campaign_name: 'Campaña', platform: 'Plataforma',
  clicks: 'Clics', impressions: 'Impresiones', conversions: 'Conversiones',
  roas: 'ROAS', reach: 'Alcance', supplier: 'Proveedor', status: 'Estado',
  start_date: 'Inicio', end_date: 'Fin', revenue: 'Ingresos atribuidos',
  salary: 'Sueldo', position: 'Cargo', department: 'Área',
  min_stock: 'Stock mín.', sku: 'SKU', price: 'Precio',
  total_purchases: 'Total compras', debt: 'Deuda', last_purchase: 'Últ. compra',
};
const semanticLabel = (k: string) => SEMANTIC_LABELS[k] || k;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024; // 5GB
const ROW_BATCH_SIZE = 500;
const RATE_LIMIT_MESSAGE = "Límite de API alcanzado. El archivo será reprocesado automáticamente en unos minutos.";

/**
 * Detect and skip title rows in Excel data parsed by SheetJS.
 * If >50% of columns are __EMPTY*, search first rows for real headers.
 */
function fixBrokenHeaders(rows: Record<string, unknown>[]): { rows: Record<string, unknown>[]; headers: string[] } {
  if (rows.length === 0) return { rows, headers: [] };

  const originalHeaders = Object.keys(rows[0]);
  const emptyCount = originalHeaders.filter(h => h.startsWith('__EMPTY') || h.trim() === '').length;

  // If headers look fine, return as-is
  if (emptyCount / originalHeaders.length < 0.5) {
    return { rows, headers: originalHeaders };
  }

  console.log(`[CargaDatos] Broken headers detected (${emptyCount}/${originalHeaders.length} are __EMPTY). Searching for real header row...`);

  // Search in first 10 rows for a row with more real text values
  const searchLimit = Math.min(10, rows.length);
  let bestRowIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < searchLimit; i++) {
    const row = rows[i];
    const values = Object.values(row).map(v => String(v ?? '').trim()).filter(v => v !== '');
    // A good header row has many non-empty string values that aren't just numbers
    const textValues = values.filter(v => isNaN(Number(v.replace(/[.,]/g, ''))));
    if (textValues.length > bestScore) {
      bestScore = textValues.length;
      bestRowIdx = i;
    }
  }

  if (bestRowIdx < 0 || bestScore < 2) {
    console.log('[CargaDatos] Could not find real header row, using original');
    return { rows, headers: originalHeaders };
  }

  // Use values from bestRowIdx as new headers
  const headerRow = rows[bestRowIdx];
  const newHeaders = originalHeaders.map(oldKey => {
    const val = String(headerRow[oldKey] ?? '').trim();
    return val || oldKey; // Keep __EMPTY if no replacement found
  });

  console.log(`[CargaDatos] Found real headers at row ${bestRowIdx}: ${newHeaders.join(', ')}`);

  // Remap remaining rows with new headers
  const dataRows = rows.slice(bestRowIdx + 1);
  const remapped = dataRows.map(row => {
    const newRow: Record<string, unknown> = {};
    originalHeaders.forEach((oldKey, j) => {
      newRow[newHeaders[j]] = row[oldKey];
    });
    return newRow;
  }).filter(row => {
    // Filter out completely empty rows
    return Object.values(row).some(v => String(v ?? '').trim() !== '');
  });

  return { rows: remapped, headers: newHeaders };
}

/**
 * Detect CSV delimiter using a median-stability heuristic.
 * Scans the first 5 non-empty lines, counts how many fields each candidate
 * delimiter would produce per line (respecting quotes), and picks the one
 * with the highest minimum field count and stable spread (max-min ≤ 2).
 * This avoids false positives when commas appear inside text fields.
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

/**
 * Simple RFC 4180 CSV parser for client-side use.
 */
function parseCSVClientSide(text: string): Record<string, unknown>[] {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM
  const delimiter = detectDelimiter(text);

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

  const nonEmpty = rows.filter(r => r.some(v => v.trim() !== ''));
  if (nonEmpty.length < 2) return [];

  const headers = nonEmpty[0].map(h => h.trim());
  const result: Record<string, unknown>[] = [];
  for (let j = 1; j < nonEmpty.length; j++) {
    const row: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((h, k) => {
      const val = nonEmpty[j][k]?.trim() || '';
      row[h] = val;
      if (val) hasValue = true;
    });
    if (hasValue) result.push(row);
  }
  return result;
}

function detectFileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'csv') return 'CSV';
  if (['xls', 'xlsx'].includes(ext)) return 'XLS';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) return 'Imagen';
  if (['doc', 'docx'].includes(ext)) return 'Word';
  if (ext === 'xml') return 'XML';
  return 'Otro';
}

// 4.2: Sanitize processing_error before showing to end-users.
// Strips stack traces and overly technical noise that confuses non-technical operators.
function sanitizeError(err: string | null | undefined): string {
  if (!err) return '';
  const looksTechnical = /at\s+\S+\s*\(.+?\)|TypeError|ReferenceError|SyntaxError|\bstack:|^\s*\{[\s\S]*\}\s*$/m.test(err);
  if (looksTechnical) {
    return 'Ocurrió un error técnico procesando el archivo. Probá reprocesarlo o contactá a soporte si persiste.';
  }
  // Trim long URLs / IDs that confuse users, cap length
  return err.replace(/https?:\/\/\S+/g, '[link]').slice(0, 400);
}

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}


const categoryLabels: Record<string, string> = {
  ventas: '📊 Ventas',
  gastos: '💰 Gastos',
  stock: '📦 Stock',
  facturas: '🧾 Facturas',
  marketing: '📈 Marketing',
  clientes: '👥 Clientes',
  rrhh: '👔 RRHH',
  otro: '📄 Otro',
};

interface SuggestionItem {
  icon: string;
  title: string;
  description: string;
  condition: boolean;
  priority: 'high' | 'medium' | 'low';
}

function ContextualAssistant({
  companySettings,
  lastUploadDates,
}: {
  companySettings: any;
  lastUploadDates: Record<string, string>;
}) {
  // 2.11: dynamic — each suggestion is keyed to a category and reads
  // lastUploadDates so we can show "✓ ya cargado · hace 3d" or
  // "⚠ desactualizado hace 45d" instead of static text.
  const wantsStock = !companySettings || companySettings.sells_products || companySettings.has_stock;
  const wantsMeta = !companySettings || companySettings.uses_meta_ads;
  const wantsGoogle = !companySettings || companySettings.uses_google_ads;
  const wantsLog = !companySettings || companySettings.has_logistics;

  const suggestions: (SuggestionItem & { category?: string })[] = [
    { icon: '📊', title: 'Hoja de ventas',           description: 'Subí tu Excel o CSV con las ventas del mes para calcular facturación, ticket promedio y tendencias.', condition: true,          priority: 'high',   category: 'ventas' },
    { icon: '💰', title: 'Facturas de proveedores',  description: 'Subí PDFs o fotos de facturas para registrar costos y calcular tu margen real.',                       condition: true,          priority: 'high',   category: 'gastos' },
    { icon: '📦', title: 'Lista de productos / stock', description: 'Subí tu inventario con cantidades, precios y costos para detectar faltantes y sobrestock.',          condition: wantsStock,    priority: 'high',   category: 'stock' },
    { icon: '📈', title: 'Reporte de Meta Ads',      description: 'Exportá el rendimiento de campañas desde Meta Business Suite y subilo acá.',                            condition: wantsMeta,     priority: 'medium', category: 'marketing' },
    { icon: '🔍', title: 'Reporte de Google Ads',    description: 'Descargá el informe de rendimiento desde Google Ads y subilo para analizar ROAS.',                      condition: wantsGoogle,   priority: 'medium', category: 'marketing' },
    { icon: '🚚', title: 'Registro de envíos',       description: 'Si tenés un registro de despachos o logística, subilo para cruzar con ventas.',                         condition: wantsLog,      priority: 'low',    category: 'otro' },
    { icon: '🏦', title: 'Resumen bancario',         description: 'Subí tu extracto bancario (CSV o PDF) para conciliar ingresos y egresos.',                              condition: true,          priority: 'low',    category: 'facturas' },
  ];

  const activeSuggestions = suggestions.filter(s => s.condition);
  const highPriority = activeSuggestions.filter(s => s.priority === 'high');
  const otherPriority = activeSuggestions.filter(s => s.priority !== 'high');

  // 2.11 helper: returns a status pill for a category based on last upload
  const statusFor = (cat?: string) => {
    // Si la categoría no fue cargada aún, mostramos un badge "Falta cargar"
    // (Ola 9 — Lucas pidió que se vea como alerta visual, no que quede vacío).
    if (!cat || !lastUploadDates[cat]) {
      return (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/15 text-warning shrink-0 whitespace-nowrap">
          ⚠ Falta cargar
        </span>
      );
    }
    const days = Math.max(0, Math.floor((Date.now() - new Date(lastUploadDates[cat]).getTime()) / 86400000));
    // Ola 10: umbral por categoría (auto-ajuste según perfil del negocio)
    const threshold = getStaleThresholdDays(cat, companySettings);
    const fresh = days <= Math.max(1, Math.floor(threshold / 3));
    const stale = days > threshold;
    const tone = fresh ? 'bg-success/15 text-success' : stale ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning';
    const label = fresh ? `✓ Hace ${days}d` : stale ? `⚠ Hace ${days}d` : `Hace ${days}d`;
    return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tone} shrink-0`}>{label}</span>;
  };

  // 2.11: dynamic top-strip — count missing high-priority categories
  const missingHigh = highPriority.filter(s => s.category && !lastUploadDates[s.category]).length;
  const staleHigh = highPriority.filter(s => {
    if (!s.category || !lastUploadDates[s.category]) return false;
    const days = Math.floor((Date.now() - new Date(lastUploadDates[s.category]).getTime()) / 86400000);
    return days > getStaleThresholdDays(s.category, companySettings);
  }).length;

  const renderItem = (s: SuggestionItem & { category?: string }, i: number) => {
    const status = statusFor(s.category);
    return (
      <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
        <span className="text-base mt-0.5">{s.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{s.title}</p>
            {status}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
        </div>
      </div>
    );
  };

  return (
    <Card className="h-fit sticky top-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-warning" />
          ¿Qué archivos subir?
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          {missingHigh > 0
            ? `Te faltan ${missingHigh} fuente${missingHigh === 1 ? '' : 's'} prioritaria${missingHigh === 1 ? '' : 's'} para activar el dashboard completo.`
            : staleHigh > 0
            ? `${staleHigh} fuente${staleHigh === 1 ? '' : 's'} prioritaria${staleHigh === 1 ? '' : 's'} con datos desactualizados.`
            : 'Tus fuentes prioritarias están al día. Estos datos opcionales suman precisión:'}
        </p>
      </CardHeader>
      <CardContent className="space-y-1 pb-4">
        {highPriority.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Prioritarios</p>
            {highPriority.map(renderItem)}
          </>
        )}
        {otherPriority.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-3 mb-2">Opcionales</p>
            {otherPriority.map(renderItem)}
          </>
        )}
        <p className="text-[10px] text-muted-foreground border-t pt-3 mt-3">
          Formatos: PDF, CSV, XLS/XLSX, imágenes (capturas de reportes). Máx. 50MB por archivo. Sin límite de filas — se procesan en bloques automáticamente.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Upload Queue Component ───────────────────────────────────
function UploadQueue({ items, onDismiss }: { items: UploadQueueItem[]; onDismiss: () => void }) {
  if (items.length === 0) return null;

  const completed = items.filter(i => i.status === 'done').length;
  const errors = items.filter(i => i.status === 'error').length;
  const total = items.length;
  const allDone = items.every(i => i.status === 'done' || i.status === 'error');
  const overallProgress = total > 0 ? Math.round(((completed + errors) / total) * 100) : 0;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            {allDone
              ? `✅ ${completed} archivo(s) subido(s)${errors > 0 ? `, ${errors} con error` : ''}`
              : `Subiendo ${total} archivo(s)... (${completed}/${total})`}
          </CardTitle>
          {/* 2.3: Botón siempre visible para evitar bloqueos si un upload queda colgado */}
          <Button variant="ghost" size="sm" onClick={onDismiss} className="h-7 text-xs">
            {allDone ? 'Cerrar' : 'Ocultar'}
          </Button>
        </div>
        <Progress value={overallProgress} className="h-1.5" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="max-h-40 overflow-y-auto space-y-1">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 text-xs py-1">
              {item.status === 'done' ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
              ) : item.status === 'error' ? (
                <span className="text-destructive shrink-0">✗</span>
              ) : (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
              )}
              <span className="truncate flex-1">{item.file.name}</span>
              {item.sheetStatuses && item.sheetStatuses.length > 0 && (
                <span className="text-muted-foreground whitespace-nowrap text-[10px] flex items-center gap-1">
                  {item.sheetStatuses.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-0.5">
                      {s.status === 'done' ? '✓' : s.status === 'error' ? '✗' : s.status === 'processing' ? '⏳' : '○'}
                      {s.name}
                      {i < item.sheetStatuses!.length - 1 ? ',' : ''}
                    </span>
                  ))}
                </span>
              )}
              {/* 2.5: Diferenciar fase de subida vs procesamiento IA */}
              {item.status === 'uploading' && (
                <span className="text-muted-foreground whitespace-nowrap text-[10px]">Subiendo a storage...</span>
              )}
              {item.status === 'processing' && item.currentChunk !== undefined && item.totalChunks && item.totalChunks > 1 && (
                <span className="text-muted-foreground whitespace-nowrap text-[10px]">IA procesando bloque {item.currentChunk + 1}/{item.totalChunks}</span>
              )}
              {item.status === 'processing' && (item.currentChunk === undefined || (item.totalChunks ?? 1) <= 1) && (
                <span className="text-muted-foreground whitespace-nowrap text-[10px]">IA clasificando...</span>
              )}
              {item.status === 'done' && item.totalRows && item.totalRows > 0 && (
                <span className="text-success whitespace-nowrap">
                  {item.totalRows.toLocaleString('es-AR')} filas{item.totalChunks && item.totalChunks > 1 ? ` en ${item.totalChunks} bloques` : ''}
                  {item.chunksFailed && item.chunksFailed > 0 ? ` (${item.chunksFailed} bloque(s) fallaron)` : ''}
                </span>
              )}
              {item.status === 'error' && item.error && (
                <span className="text-destructive truncate max-w-[200px]">{item.error}</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Status Dashboard ─────────────────────────────────────────
function StatusDashboard({ files, totalCount, archivedCount = 0 }: { files: FileRecord[]; totalCount: number; archivedCount?: number }) {
  const activeFiles = files.filter(f => f.status !== 'archived');
  const processed = activeFiles.filter(f => f.status === 'processed').length;
  const review = activeFiles.filter(f => f.status === 'review' || f.status === 'processed_with_issues').length;
  const queued = activeFiles.filter(f => f.status === 'queued').length;
  const processing = activeFiles.filter(f => f.status === 'processing').length;
  const errors = activeFiles.filter(f => f.status === 'error').length;

  // 2.1: Empty state — onboarding inline en lugar de pantalla vacía
  if (totalCount === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-primary/30 p-6 text-center bg-gradient-to-br from-primary/5 via-transparent to-transparent">
        <div className="flex items-center justify-center mb-2">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="h-5 w-5 text-primary/70" />
          </div>
        </div>
        <p className="text-sm font-semibold mb-0.5">Empezá subiendo tu primer archivo</p>
        <p className="text-xs text-muted-foreground">Arrastrá un Excel, CSV o PDF — la IA detecta y categoriza los datos automáticamente.</p>
      </div>
    );
  }

  type TileColor = 'success' | 'warning' | 'destructive' | 'neutral';
  type TileDef = { count: number; label: string; icon: typeof CheckCircle2; color: TileColor; always?: boolean; spin?: boolean; };

  const allTiles: TileDef[] = [
    { count: processed, label: 'Procesados', icon: CheckCircle2, color: 'success', always: true },
    { count: review, label: 'A revisar', icon: AlertTriangle, color: 'warning' },
    { count: queued, label: 'En cola', icon: Clock, color: 'neutral' },
    { count: processing, label: 'Procesando', icon: Loader2, color: 'warning', spin: true },
    { count: errors, label: 'Errores', icon: AlertTriangle, color: 'destructive' },
    { count: archivedCount, label: 'Archivados', icon: Archive, color: 'neutral' },
  ];
  const tiles = allTiles.filter(t => t.always || t.count > 0);

  const colorMap: Record<TileColor, { wrapper: string; text: string }> = {
    success:     { wrapper: 'bg-success/8 border-success/25',     text: 'text-success' },
    warning:     { wrapper: 'bg-warning/8 border-warning/25',     text: 'text-warning' },
    destructive: { wrapper: 'bg-destructive/8 border-destructive/25', text: 'text-destructive' },
    neutral:     { wrapper: 'bg-muted/60 border-border/60',        text: 'text-muted-foreground' },
  };

  return (
    <div className="flex flex-wrap gap-2">
      {tiles.map(({ count, label, icon: Icon, color, spin }) => {
        const { wrapper, text } = colorMap[color];
        return (
          <div
            key={label}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${wrapper}`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${text} ${spin && count > 0 ? 'animate-spin' : ''}`} />
            <div>
              <p className={`text-2xl font-bold leading-none ${text}`}>{count}</p>
              <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function CargaDatos() {
  const { user, profile, role, companySettings } = useAuth();
  const { refetch: refetchExtractedData, data: globalExtractedData, mappings: globalMappings, taggedVentasRows, taggedGastosRows, taggedMarketingRows, lastUploadDates } = useExtractedData();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [extractedDataMap, setExtractedDataMap] = useState<Record<string, ExtractedData[]>>({});
  const [dragging, setDragging] = useState(false);
  // 2.2 inline drag validation — peeks at the dragged item MIME types
  const [dragInvalidMsg, setDragInvalidMsg] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [storageUsedBytes, setStorageUsedBytes] = useState<number>(0);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null); // file_upload_id being reclassified
  // 2.4: Confirmación antes de reclasificar — evita mis-clicks que rompan el dashboard
  const [pendingReclassify, setPendingReclassify] = useState<{ fileId: string; fileName: string; newCategory: string; oldCategory: string } | null>(null);
  // 5.1: Schema Preview & Confirmation — block upload until user confirms
  // category & inspects sample rows. Resolved via a Promise the upload flow awaits.
  const [pendingPreview, setPendingPreview] = useState<{ payload: SchemaPreviewPayload; category: string } | null>(null);
  const previewResolverRef = useRef<((value: { confirmed: boolean; category: string }) => void) | null>(null);
  // Ola 17: delete requests — employees solicitan, admin aprueba
  const { pending: deletePending, requestDelete, approveRequest, rejectRequest } = useDeleteRequests();
  const [pendingDeleteRequest, setPendingDeleteRequest] = useState<{ file: FileRecord; reason: string } | null>(null);
  const [submittingDeleteRequest, setSubmittingDeleteRequest] = useState(false);

  // Ola 12: multi-hoja UI — picker antes de procesar Excel con varias hojas
  const [pendingSheets, setPendingSheets] = useState<{ fileName: string; sheets: SheetInfo[] } | null>(null);
  const sheetResolverRef = useRef<((value: string[] | null) => void) | null>(null);
  const askSheetsToProcess = (fileName: string, sheets: SheetInfo[]) =>
    new Promise<string[] | null>((resolve) => {
      sheetResolverRef.current = resolve;
      setPendingSheets({ fileName, sheets });
    });
  const handleSheetsConfirm = (selected: string[]) => {
    sheetResolverRef.current?.(selected);
    sheetResolverRef.current = null;
    setPendingSheets(null);
  };
  const handleSheetsCancel = () => {
    sheetResolverRef.current?.(null);
    sheetResolverRef.current = null;
    setPendingSheets(null);
  };
  // 5.2: DQ scores keyed by file_upload_id. Computed at upload time (rows in
  // scope) and cached in session state. Old files show no badge until reprocessed.
  const [dqScoresMap, setDqScoresMap] = useState<Record<string, DataQualityScore>>({});
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInFlightRef = useRef(false); // 1.3: guard against overlapping polls
  const prevErrorIdsRef = useRef<Set<string>>(new Set());
  const [urlImportText, setUrlImportText] = useState('');
  const [isImportingUrls, setIsImportingUrls] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);
  // B3: column mapping preview — maps fileUploadId → { semanticKey: "Original Column Name" }
  const [columnMappingMap, setColumnMappingMap] = useState<Record<string, Record<string, string>>>({});
  // C4: Archivados — estado independiente de los filtros activos
  const [archivedFiles, setArchivedFiles] = useState<FileRecord[]>([]);

  // Overlap detection state
  const [overlapInfo, setOverlapInfo] = useState<{
    fileUploadId: string;
    fileName: string;
    overlappingMonths: string[];
    category: string;
    diff?: VersionDiff; // 5.7: per-month delta (totals, row counts, products)
  } | null>(null);

  // Stock duplicate detection state (BUG 1 fix)
  const [stockDuplicateInfo, setStockDuplicateInfo] = useState<{
    fileUploadId: string;
    fileName: string;
    matchPct: number;
    newProductCount: number;
  } | null>(null);

  // Pagination & filters
  const [currentPage, setCurrentPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  // 5.14 Lineage: read ?category= URL param to prefilter file list when arriving
  // from a Dashboard pill click. Filter is applied client-side because category
  // lives in file_extracted_data, not file_uploads.
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category') || 'all';
  const setCategoryFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'all') next.delete('category'); else next.set('category', v);
    setSearchParams(next, { replace: true });
    setCurrentPage(0);
  };
  // 5.9 Bulk recategorize: multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRecategorizing, setBulkRecategorizing] = useState(false);

  const fetchExtractedData = useCallback(async (fileIds: string[]) => {
    if (fileIds.length === 0) return;
    // 3.2: run both queries in parallel — they hit different rows (data_category
    // filter) and have different projections (extracted_json is heavy and only
    // needed for _column_mapping). Promise.all halves the round-trip latency.
    const [summaryRes, mappingRes] = await Promise.all([
      supabase
        .from('file_extracted_data')
        .select('file_upload_id, data_category, summary, row_count, chunk_index')
        .in('file_upload_id', fileIds)
        .order('chunk_index', { ascending: true }),
      supabase
        .from('file_extracted_data')
        .select('file_upload_id, extracted_json')
        .in('file_upload_id', fileIds)
        .eq('data_category', '_column_mapping'),
    ]);
    const data = summaryRes.data;
    const mappingData = mappingRes.data;
    if (data) {
      const map: Record<string, ExtractedData[]> = {};
      data.forEach(d => {
        const key = d.file_upload_id;
        if (!map[key]) map[key] = [];
        map[key].push(d as ExtractedData);
      });
      setExtractedDataMap(prev => ({ ...prev, ...map }));
    }
    if (mappingData) {
      const newMappings: Record<string, Record<string, string>> = {};
      mappingData.forEach(m => {
        const json = m.extracted_json as any;
        const colMap = json?.column_mapping;
        if (colMap && typeof colMap === 'object') {
          const filtered: Record<string, string> = {};
          for (const [k, v] of Object.entries(colMap)) {
            if (v && typeof v === 'string') filtered[k] = v;
          }
          if (Object.keys(filtered).length > 0) newMappings[m.file_upload_id] = filtered;
        }
      });
      setColumnMappingMap(prev => ({ ...prev, ...newMappings }));
    }
  }, []);

  // C4: Fetch archivados independientemente de los filtros activos
  const fetchArchivedFiles = useCallback(async () => {
    if (!profile?.company_id) return;
    const { data } = await supabase
      .from('file_uploads')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('status', 'archived')
      .order('created_at', { ascending: false });
    const archived = (data as FileRecord[]) || [];
    setArchivedFiles(archived);
    // Traer sus extracted data para mostrar categoría en el historial
    const ids = archived.map(f => f.id);
    if (ids.length > 0) fetchExtractedData(ids);
  }, [profile?.company_id, fetchExtractedData]);

  const fetchFiles = useCallback(async () => {
    if (!profile?.company_id) return;
    try {
      let query = supabase
        .from('file_uploads')
        .select('*', { count: 'exact' })
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      if (role === 'employee') {
        query = query.eq('uploaded_by', user?.id);
      }
      if (searchTerm.trim()) {
        query = query.ilike('file_name', `%${searchTerm.trim()}%`);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (typeFilter !== 'all') {
        query = query.eq('file_type', typeFilter);
      }

      const from = currentPage * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      const records = (data as FileRecord[]) || [];
      setFiles(records);
      setTotalCount(count || 0);

      // 1.13: Toast dedup persistido en localStorage para no re-notificar al cambiar de página/filtro
      const NOTIFIED_KEY = `wod_notified_error_ids_${profile.company_id}`;
      let notified: Set<string>;
      try {
        const raw = localStorage.getItem(NOTIFIED_KEY);
        notified = new Set(raw ? JSON.parse(raw) : []);
      } catch { notified = new Set(); }
      let changed = false;
      for (const f of records) {
        if (f.status === 'error' && !notified.has(f.id)) {
          toast.error(`Error procesando "${f.file_name}"`, {
            description: sanitizeError(f.processing_error) || 'Error desconocido durante el procesamiento',
            duration: 8000,
          });
          notified.add(f.id);
          changed = true;
        }
      }
      // Limpiar IDs cuyo estado dejó de ser error (permitir re-notificación si vuelve a fallar)
      const currentErrorIds = new Set(records.filter(f => f.status === 'error').map(f => f.id));
      for (const id of [...notified]) {
        const stillVisible = records.some(f => f.id === id);
        if (stillVisible && !currentErrorIds.has(id)) {
          notified.delete(id);
          changed = true;
        }
      }
      if (changed) {
        try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notified])); } catch {}
      }
      prevErrorIdsRef.current = currentErrorIds;

      const processedIds = records.filter(f => f.status === 'processed' || f.status === 'review' || f.status === 'processed_with_issues').map(f => f.id);
      if (processedIds.length > 0) fetchExtractedData(processedIds);
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setLoadingFiles(false);
    }
  }, [profile?.company_id, role, user?.id, fetchExtractedData, currentPage, searchTerm, statusFilter, typeFilter]);

  // Fetch storage usage — 1.2: excluye archivados de la cuota visible
  // (siguen ocupando R2 físicamente pero no le contamos el espacio al usuario hasta que los borre)
  const fetchStorageUsage = useCallback(async () => {
    if (!profile?.company_id) return;
    const { data, error } = await supabase
      .from('file_uploads')
      .select('file_size')
      .eq('company_id', profile.company_id)
      .neq('status', 'archived');
    if (!error && data) {
      const total = data.reduce((sum, f) => sum + (f.file_size || 0), 0);
      setStorageUsedBytes(total);
    }
  }, [profile?.company_id]);

  useEffect(() => {
    fetchFiles();
    fetchStorageUsage();
    fetchArchivedFiles();
  }, [fetchFiles, fetchStorageUsage, fetchArchivedFiles]);

  // Polling
  useEffect(() => {
    const hasProcessing = files.some(f => f.status === 'processing' || f.status === 'queued');
    if (hasProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        // 1.3: skip tick if previous fetch hasn't returned (slow network) to
        // prevent overlapping requests stomping on each other and triggering
        // duplicate toasts.
        if (pollInFlightRef.current) return;
        pollInFlightRef.current = true;
        try { await fetchFiles(); } finally { pollInFlightRef.current = false; }
      }, 5000);
    } else if (!hasProcessing && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [files, fetchFiles]);


  // ─── Upload with presigned URL for large files ────────────
  const uploadFileToStorage = async (file: File, userId: string): Promise<{ storagePath: string }> => {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Este archivo supera el límite de 50MB (${(file.size / 1024 / 1024).toFixed(0)}MB). Para archivos más grandes, exportá el Excel en partes o contactá a soporte.`);
    }

    if (file.size > PRESIGN_THRESHOLD) {
      // Large file: use presigned URL
      const { data: presignData, error: presignError } = await supabase.functions.invoke('r2-presign', {
        body: { fileName: file.name, userId, contentType: file.type || 'application/octet-stream' },
      });

      if (presignError || !presignData?.success) {
        throw new Error(presignError?.message || presignData?.error || 'Error obteniendo URL de subida');
      }

      // Upload directly to R2
      const putResp = await fetch(presignData.presignedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });

      if (!putResp.ok) {
        throw new Error(`Error subiendo archivo grande [${putResp.status}]`);
      }

      return { storagePath: presignData.storagePath };
    } else {
      // Small file: use r2-upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', userId);

      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('r2-upload', {
        body: formData,
      });

      if (uploadError || !uploadData?.success) {
        throw new Error(uploadError?.message || uploadData?.error || 'Error de subida');
      }

      return { storagePath: uploadData.storagePath };
    }
  };

  // 5.1: Schema Preview helpers — return a Promise the upload flow awaits.
  // Concurrent uploads serialize on this dialog (next file's preview only
  // shows after the prior one is confirmed/cancelled).
  const awaitSchemaPreview = (payload: SchemaPreviewPayload): Promise<{ confirmed: boolean; category: string }> => {
    return new Promise((resolve) => {
      const initialCat = suggestCategory(payload.headers).category;
      setPendingPreview({ payload, category: initialCat });
      previewResolverRef.current = resolve;
    });
  };
  const handlePreviewConfirm = () => {
    if (pendingPreview && previewResolverRef.current) {
      previewResolverRef.current({ confirmed: true, category: pendingPreview.category });
      previewResolverRef.current = null;
      setPendingPreview(null);
    }
  };
  const handlePreviewCancel = () => {
    if (previewResolverRef.current) {
      previewResolverRef.current({ confirmed: false, category: '' });
      previewResolverRef.current = null;
    }
    setPendingPreview(null);
  };

  // ─── Batch Upload with Parallel Queue ──────────────────────
  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!user || !profile?.company_id) return;
    const filesToUpload = Array.from(fileList);
    if (filesToUpload.length === 0) return;

    // 2.2 Validate file formats AND per-file size (50MB cap on edge function).
    // Surface ALL rejects in a single toast list rather than one toast per file.
    const SUPPORTED_EXTENSIONS = ['xlsx', 'xls', 'xlsm', 'csv', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'doc', 'docx', 'xml', 'txt'];
    const PER_FILE_MAX = 50 * 1024 * 1024; // 50MB
    const validFiles: File[] = [];
    const rejectedByExt: { name: string; ext: string }[] = [];
    const rejectedBySize: { name: string; mb: string }[] = [];
    for (const file of filesToUpload) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        rejectedByExt.push({ name: file.name, ext });
        continue;
      }
      if (file.size > PER_FILE_MAX) {
        rejectedBySize.push({ name: file.name, mb: (file.size / 1024 / 1024).toFixed(1) });
        continue;
      }
      validFiles.push(file);
    }
    if (rejectedByExt.length > 0) {
      const list = rejectedByExt.slice(0, 3).map(r => `${r.name} (.${r.ext})`).join(', ');
      const more = rejectedByExt.length > 3 ? ` y ${rejectedByExt.length - 3} más` : '';
      toast.error(`${rejectedByExt.length} archivo${rejectedByExt.length === 1 ? '' : 's'} con formato no compatible`, {
        description: `${list}${more}. Aceptados: Excel, CSV, PDF, imágenes, Word, XML.`,
        duration: 8000,
      });
    }
    if (rejectedBySize.length > 0) {
      const list = rejectedBySize.slice(0, 3).map(r => `${r.name} (${r.mb}MB)`).join(', ');
      const more = rejectedBySize.length > 3 ? ` y ${rejectedBySize.length - 3} más` : '';
      toast.error(`${rejectedBySize.length} archivo${rejectedBySize.length === 1 ? '' : 's'} supera${rejectedBySize.length === 1 ? '' : 'n'} 50MB`, {
        description: `${list}${more}. Dividí el archivo o exportá en CSV para reducir tamaño.`,
        duration: 9000,
      });
    }
    if (validFiles.length === 0) return;

    // Check storage limit
    const totalNewSize = validFiles.reduce((sum, f) => sum + f.size, 0);
    if (storageUsedBytes + totalNewSize > MAX_STORAGE_BYTES) {
      const usedGB = (storageUsedBytes / 1024 / 1024 / 1024).toFixed(1);
      toast.error(`Has alcanzado el límite de almacenamiento (5GB). Usás ${usedGB} GB. Eliminá archivos antiguos desde esta página para liberar espacio.`, { duration: 10000 });
      return;
    }

    const queueItems: UploadQueueItem[] = validFiles.map((file, i) => ({
      file,
      id: `upload-${Date.now()}-${i}`,
      progress: 0,
      status: 'pending',
    }));
    setUploadQueue(queueItems);

    const activePromises: Promise<void>[] = [];
    let nextIdx = 0;

    const processNext = async (): Promise<void> => {
      const idx = nextIdx++;
      if (idx >= queueItems.length) return;
      const item = queueItems[idx];

      const updateItem = (updates: Partial<UploadQueueItem>) => {
        Object.assign(item, updates);
        setUploadQueue([...queueItems]);
      };

      updateItem({ status: 'uploading', progress: 10 });

      try {
        const fileHash = await computeFileHash(item.file);
        updateItem({ progress: 30 });

        const { data: existing } = await supabase
          .from('file_uploads')
          .select('id, file_name')
          .eq('company_id', profile.company_id!)
          .eq('file_hash', fileHash)
          .limit(1);

        if (existing && existing.length > 0) {
          updateItem({ status: 'error', error: `Duplicado de "${existing[0].file_name}"` });
          await processNext();
          return;
        }

        updateItem({ progress: 50 });

        const { storagePath } = await uploadFileToStorage(item.file, user.id);

        updateItem({ progress: 70 });

        // Parse Excel files client-side → send structured row batches
        const ext = item.file.name.split('.').pop()?.toLowerCase() || '';
        const isExcel = ['xls', 'xlsx', 'xlsm'].includes(ext);
        const isCsv = ext === 'csv';
        let parsedRows: Record<string, unknown>[] | null = null;
        let parsedHeaders: string[] | null = null;

        if (isExcel) {
          // Warn about macros in .xlsm files
          if (ext === 'xlsm') {
            toast.info(`"${item.file.name}" contiene macros que serán ignoradas. Solo se procesarán los datos.`, { duration: 6000 });
          }

          try {
            updateItem({ progress: 72 });
            const buffer = await item.file.arrayBuffer();
            let wb: XLSX.WorkBook;
            try {
              wb = XLSX.read(buffer, { type: 'array', dense: true, cellStyles: false, cellNF: false, cellText: false, sheetRows: 50000 });
            } catch (parseErr: any) {
              const msg = parseErr?.message || '';
              if (msg.includes('password') || msg.includes('encrypt') || msg.includes('Password')) {
                updateItem({ status: 'error', error: 'Archivo protegido con contraseña' });
                toast.error(`"${item.file.name}" está protegido con contraseña`, {
                  description: 'Por favor quitá la contraseña antes de subirlo (en Excel: Revisar → Proteger libro → Quitar contraseña).',
                  duration: 10000,
                });
                await processNext();
                return;
              }
              throw parseErr;
            }

            // Parse each sheet independently
            const sheetDataSets: { name: string; rows: Record<string, unknown>[]; headers: string[] }[] = [];
            for (const sheetName of wb.SheetNames) {
              const sheet = wb.Sheets[sheetName];
              if (!sheet) continue;
              const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
              if (sheetRows.length === 0) continue;
              const fixed = fixBrokenHeaders(sheetRows);
              // Skip sheets with less than 2 data rows (cover pages, instructions, etc.)
              if (fixed.rows.length < 2) {
                console.log(`[CargaDatos] Skipping sheet "${sheetName}" — only ${fixed.rows.length} row(s)`);
                continue;
              }
              sheetDataSets.push({ name: sheetName, ...fixed });
            }

            if (sheetDataSets.length > 1) {
              // Ola 12: si hay >1 hojas válidas, le damos al usuario la opción
              // de elegir cuáles procesar antes de seguir.
              const sheetInfos: SheetInfo[] = sheetDataSets.map(s => ({
                name: s.name,
                rows: s.rows.length,
                headers: s.headers,
              }));
              const selectedNames = await askSheetsToProcess(item.file.name, sheetInfos);
              if (selectedNames === null) {
                updateItem({ status: 'error', error: 'Cancelado por el usuario' });
                await processNext();
                return;
              }
              if (selectedNames.length === 0) {
                updateItem({ status: 'error', error: 'No seleccionaste ninguna hoja' });
                toast.warning(`"${item.file.name}": no seleccionaste ninguna hoja para procesar.`);
                await processNext();
                return;
              }
              // Filtrar las hojas elegidas
              const filteredSets = sheetDataSets.filter(s => selectedNames.includes(s.name));
              sheetDataSets.length = 0;
              sheetDataSets.push(...filteredSets);
              if (sheetDataSets.length === 1) {
                // Si después del filtro queda solo una, caemos en el flujo single-sheet
                parsedRows = cleanParsedRows(sheetDataSets[0].rows, sheetDataSets[0].headers);
                parsedHeaders = sheetDataSets[0].headers;
                if (selectedNames.length < sheetInfos.length) {
                  toast.info(`Procesando solo "${sheetDataSets[0].name}" (${sheetInfos.length - 1} hoja(s) descartada(s))`);
                }
                // continúa al final del bloque excel con parsedRows ya seteados
              }
            }

            if (sheetDataSets.length > 1) {
              // Check if all sheets share the same headers → concatenate
              const firstHeaders = [...sheetDataSets[0].headers].sort().join('|');
              const allSame = sheetDataSets.every(s => [...s.headers].sort().join('|') === firstHeaders);

              if (allSame) {
                // Same headers: concatenate into single dataset
                const allRows = sheetDataSets.flatMap(s => s.rows);
                // 1.9: avisar al usuario si truncamos
                if (allRows.length > 50000) {
                  toast.warning(`"${item.file.name}": el archivo tiene ${allRows.length.toLocaleString('es-AR')} filas. Solo se procesarán las primeras 50.000 — para procesar el resto, dividilo en archivos más chicos.`, { duration: 12000 });
                  allRows.length = 50000;
                }
                {
                  const stats = cleanParsedRowsWithStats(allRows, sheetDataSets[0].headers);
                  parsedRows = stats.rows;
                  parsedHeaders = sheetDataSets[0].headers;
                  console.log(`[CargaDatos] ${sheetDataSets.length} sheets with same headers → concatenated ${parsedRows.length} rows (filtered ${stats.filteredCount}/${stats.originalCount})`);
                  if (stats.filterRate > 0.2 && stats.originalCount >= 10) {
                    toast.warning(`"${item.file.name}": se descartaron ${stats.filteredCount} filas (${(stats.filterRate * 100).toFixed(0)}%) durante la limpieza`, {
                      description: 'Tasa de filtrado alta. Verificá que las hojas no tengan totales o estructura irregular.',
                      duration: 12000,
                    });
                  }
                }
              } else {
                // Different headers: process each sheet as independent file
                console.log(`[CargaDatos] ${sheetDataSets.length} sheets with different headers → processing independently`);
                const sheetStatuses: SheetStatus[] = sheetDataSets.map(s => ({ name: s.name, status: 'pending' as const, rows: s.rows.length }));
                updateItem({ progress: 80, sheetStatuses });

                let totalSheetRows = 0;
                let sheetsOk = 0;
                let sheetsFailed = 0;

                for (let si = 0; si < sheetDataSets.length; si++) {
                  const sd = sheetDataSets[si];
                  sheetStatuses[si].status = 'processing';
                  updateItem({ sheetStatuses: [...sheetStatuses] });

                  const sheetFileName = `${item.file.name} — ${sd.name}`;
                  const cleanedRows = cleanParsedRows(sd.rows, sd.headers);
                  if (cleanedRows.length < 2) {
                    sheetStatuses[si].status = 'done';
                    sheetStatuses[si].rows = 0;
                    updateItem({ sheetStatuses: [...sheetStatuses] });
                    continue;
                  }

                  try {
                    // Create a separate file_uploads record for this sheet
                    const { data: sheetDbData, error: sheetDbErr } = await supabase.from('file_uploads').insert({
                      file_name: sheetFileName,
                      file_type: detectFileType(item.file.name),
                      file_size: item.file.size,
                      status: 'processing',
                      storage_path: storagePath,
                      uploaded_by: user.id,
                      company_id: profile.company_id!,
                      // 1.1: include normalized sheet NAME (not just index) so the
                      // hash still detects duplicates if sheets are reordered or if
                      // the user re-uploads the same workbook with the same sheets.
                      file_hash: `${fileHash}-sheet-${(sd.name || `idx${si}`).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`,
                    }).select('id').single();

                    if (sheetDbErr || !sheetDbData) throw new Error(sheetDbErr?.message || 'DB insert failed');

                    // Send all batches for this sheet
                    const sheetTotalBatches = Math.ceil(cleanedRows.length / ROW_BATCH_SIZE);
                    let resolvedCat: string | undefined;
                    for (let bi = 0; bi < sheetTotalBatches; bi++) {
                      const batchRows = cleanedRows.slice(bi * ROW_BATCH_SIZE, (bi + 1) * ROW_BATCH_SIZE);
                      const { data: pfData, error: pfError } = await supabase.functions.invoke('process-file', {
                        body: {
                          fileUploadId: sheetDbData.id,
                          companyId: profile.company_id!,
                          rowBatch: batchRows,
                          headers: sd.headers,
                          batchIndex: bi,
                          totalBatches: sheetTotalBatches,
                          totalRows: cleanedRows.length,
                          sheetName: sd.name,
                          ...(bi > 0 && resolvedCat ? { category: resolvedCat } : {}),
                        },
                      });
                      if (pfError) throw pfError;
                      if (bi === 0 && pfData?.category) resolvedCat = pfData.category;
                    }

                    totalSheetRows += cleanedRows.length;
                    sheetsOk++;
                    sheetStatuses[si].status = 'done';
                    sheetStatuses[si].rows = cleanedRows.length;
                  } catch (sheetErr: any) {
                    console.error(`[CargaDatos] Sheet "${sd.name}" failed:`, sheetErr);
                    sheetStatuses[si].status = 'error';
                    sheetsFailed++;
                  }
                  updateItem({
                    sheetStatuses: [...sheetStatuses],
                    progress: 80 + Math.round(((si + 1) / sheetDataSets.length) * 19),
                  });
                }

                // Multi-sheet is done — mark the main upload item
                if (sheetsFailed === sheetDataSets.length) {
                  updateItem({ status: 'error', error: 'Todas las hojas fallaron', progress: 100 });
                } else {
                  updateItem({
                    status: 'done',
                    progress: 100,
                    totalRows: totalSheetRows,
                    chunksFailed: sheetsFailed,
                  });
                  toast.success(`"${item.file.name}" — ${sheetsOk} hoja(s) procesada(s), ${totalSheetRows.toLocaleString('es-AR')} filas${sheetsFailed > 0 ? `. ${sheetsFailed} hoja(s) con error` : ''}`);
                }
                // Skip the normal single-file flow below
                await processNext();
                return;
              }
            } else if (sheetDataSets.length === 1) {
              const allRows = sheetDataSets[0].rows;
              // 1.9: avisar al usuario si truncamos
              if (allRows.length > 50000) {
                toast.warning(`"${item.file.name}": el archivo tiene ${allRows.length.toLocaleString('es-AR')} filas. Solo se procesarán las primeras 50.000.`, { duration: 12000 });
                allRows.length = 50000;
              }
              {
                const stats = cleanParsedRowsWithStats(allRows, sheetDataSets[0].headers);
                parsedRows = stats.rows;
                parsedHeaders = sheetDataSets[0].headers;
                if (stats.filterRate > 0.2 && stats.originalCount >= 10) {
                  toast.warning(`"${item.file.name}": se descartaron ${stats.filteredCount} filas (${(stats.filterRate * 100).toFixed(0)}%) durante la limpieza`, {
                    description: 'Tasa de filtrado alta. Verificá que el archivo no tenga totales o estructura irregular.',
                    duration: 12000,
                  });
                }
              }
            }
            updateItem({ progress: 80 });
            console.log(`[CargaDatos] Client-side parsed: ${parsedRows?.length ?? 0} rows, ${parsedHeaders?.length ?? 0} cols`);
          } catch (parseErr) {
            console.warn('[CargaDatos] Client-side Excel parse failed, falling back to server:', parseErr);
          }
        } else if (isCsv) {
          try {
            updateItem({ progress: 72 });
            const text = await item.file.text();
            const rows = parseCSVClientSide(text);
            if (rows.length > 0) {
              const fixed = fixBrokenHeaders(rows);
              // 1.9: avisar al usuario si truncamos
              if (fixed.rows.length > 50000) {
                toast.warning(`"${item.file.name}": el archivo tiene ${fixed.rows.length.toLocaleString('es-AR')} filas. Solo se procesarán las primeras 50.000.`, { duration: 12000 });
                fixed.rows.length = 50000;
              }
              parsedRows = fixed.rows;
              parsedHeaders = fixed.headers;
            }
            // Clean data: convert serial dates + filter summary rows
            if (parsedRows && parsedHeaders) {
              const stats = cleanParsedRowsWithStats(parsedRows, parsedHeaders);
              parsedRows = stats.rows;
              console.log(`[CargaDatos] CSV after cleaning: ${parsedRows.length} rows (filtered ${stats.filteredCount}/${stats.originalCount}, ${(stats.filterRate * 100).toFixed(1)}%)`);
              if (stats.filterRate > 0.2 && stats.originalCount >= 10) {
                toast.warning(`"${item.file.name}": se descartaron ${stats.filteredCount} filas (${(stats.filterRate * 100).toFixed(0)}%) durante la limpieza`, {
                  description: 'Tasa de filtrado alta. Verificá que el archivo no tenga formato inusual (delimitador raro, encabezados duplicados, columnas vacías).',
                  duration: 12000,
                });
              }
            }
            updateItem({ progress: 80 });
            console.log(`[CargaDatos] Client-side CSV parsed: ${parsedRows?.length ?? 0} rows`);
          } catch (parseErr) {
            console.warn('[CargaDatos] Client-side CSV parse failed, falling back to server:', parseErr);
          }
        }

        // Ola 21: si el parse client-side dejó parsedRows EXISTENTE pero VACÍO
        // (ej: el cleanup filtró todas las filas como "totales" o el archivo
        // tenía solo headers), antes esto provocaba que el upload quedara en
        // 'queued' indefinidamente. Ahora lo marcamos como error explícito.
        if (parsedRows && parsedRows.length === 0) {
          updateItem({ status: 'error', error: 'El archivo no contiene filas válidas para procesar (¿solo headers? ¿totales?). Verificá el contenido y volvé a subirlo.' });
          toast.error(`"${item.file.name}": no se encontraron filas válidas`, {
            description: 'El archivo se parseó pero quedó vacío después de la limpieza. Capaz tiene solo headers o líneas de totales.',
            duration: 10000,
          });
          await processNext();
          return;
        }

        // 5.1: Schema Preview & Confirmation. Only ask when client-side
        // parsing succeeded — server-side fallback has nothing to preview.
        let categoryOverride: string | undefined;
        if (parsedRows && parsedHeaders && parsedRows.length > 0) {
          updateItem({ status: 'pending', progress: 82 });
          const preview = await awaitSchemaPreview({
            fileName: item.file.name,
            headers: parsedHeaders,
            rows: parsedRows.slice(0, 20),
            totalRows: parsedRows.length,
          });
          if (!preview.confirmed) {
            updateItem({ status: 'error', error: 'Cancelado por el usuario en la vista previa' });
            await processNext();
            return;
          }
          categoryOverride = preview.category;
          updateItem({ status: 'uploading', progress: 84 });
        }

        const { data: dbData, error: dbError } = await supabase.from('file_uploads').insert({
          file_name: item.file.name,
          file_type: detectFileType(item.file.name),
          file_size: item.file.size,
          status: parsedRows ? 'processing' : 'queued',
          storage_path: storagePath,
          uploaded_by: user.id,
          company_id: profile.company_id!,
          file_hash: fileHash,
        }).select('id').single();

        if (dbError) {
          updateItem({ status: 'error', error: dbError.message });
          await processNext();
          return;
        }

        // Send structured row batches to process-file
        if (parsedRows && parsedHeaders && dbData?.id) {
          updateItem({ progress: 85, status: 'processing' });
          try {
            const totalBatches = Math.ceil(parsedRows.length / ROW_BATCH_SIZE);
            let resolvedCategory: string | undefined;
            let chunksFailed = 0;
            let processedRows = 0;

            updateItem({ totalChunks: totalBatches, totalRows: parsedRows.length, currentChunk: 0 });

            for (let bi = 0; bi < totalBatches; bi++) {
              updateItem({ currentChunk: bi });
              const batchRows = parsedRows.slice(bi * ROW_BATCH_SIZE, (bi + 1) * ROW_BATCH_SIZE);
              try {
                const { data: pfData, error: pfError } = await supabase.functions.invoke('process-file', {
                  body: {
                    fileUploadId: dbData.id,
                    companyId: profile.company_id!,
                    rowBatch: batchRows,
                    headers: parsedHeaders,
                    batchIndex: bi,
                    totalBatches,
                    totalRows: parsedRows.length,
                    // 5.1: pass user-chosen category to ALL batches (incl. bi=0)
                    // so the edge function honors the Schema Preview override.
                    ...(categoryOverride ? { category: categoryOverride } : (bi > 0 && resolvedCategory ? { category: resolvedCategory } : {})),
                  },
                });
                if (pfError) throw pfError;
                if (bi === 0 && pfData?.category) {
                  resolvedCategory = pfData.category;
                }
                processedRows += batchRows.length;
              } catch (chunkErr: any) {
                chunksFailed++;
                console.error(`[CargaDatos] Chunk ${bi + 1}/${totalBatches} failed:`, chunkErr);
              }
              updateItem({ progress: 85 + Math.round((bi + 1) / totalBatches * 14), processedRows });
            }

            // Health check
            const { data: savedChunks } = await supabase
              .from('file_extracted_data')
              .select('row_count')
              .eq('file_upload_id', dbData.id)
              .not('data_category', 'in', '("_raw_cache","_classification","_column_mapping")');
            const savedTotal = savedChunks?.reduce((sum, c) => sum + (c.row_count || 0), 0) || 0;
            console.log(`[CargaDatos] Health check: saved ${savedTotal} vs sent ${parsedRows.length} rows`);

            if (savedTotal === 0) {
              console.error(`[CargaDatos] ❌ Health check FAILED: 0 rows saved out of ${parsedRows.length}`);
              await supabase.from('file_uploads').update({
                status: 'error',
                processing_error: `Error: no se guardaron datos (0 de ${parsedRows.length} filas). Intentá reprocesar el archivo.`,
              }).eq('id', dbData.id);
              updateItem({ status: 'error', error: `No se guardaron datos (0 de ${parsedRows.length} filas)`, chunksFailed });
            } else if (chunksFailed > 0) {
              await supabase.from('file_uploads').update({
                processing_error: `Se procesaron ${savedTotal.toLocaleString('es-AR')} de ${parsedRows.length.toLocaleString('es-AR')} filas. ${chunksFailed} bloque(s) fallaron — podés reprocesar este archivo.`,
              }).eq('id', dbData.id);
              updateItem({ status: 'done', progress: 100, chunksFailed, totalRows: savedTotal });
              toast.warning(`"${item.file.name}": se procesaron ${savedTotal.toLocaleString('es-AR')} de ${parsedRows.length.toLocaleString('es-AR')} filas. ${chunksFailed} bloque(s) fallaron.`, { duration: 8000 });
            } else {
              updateItem({ status: 'done', progress: 100, totalRows: savedTotal });
              toast.success(`"${item.file.name}" procesado correctamente — ${savedTotal.toLocaleString('es-AR')} filas${totalBatches > 1 ? ` en ${totalBatches} bloques` : ''}`);
            }

            // 5.2 + 5.3: Compute Data Quality Score and Anomaly Report client-side
            // using rows still in scope. Cached in dqScoresMap (session only).
            try {
              const finalCat = categoryOverride || resolvedCategory || 'otro';
              const dq = computeDataQuality(parsedRows, finalCat);
              setDqScoresMap(prev => ({ ...prev, [dbData.id]: dq }));
              if (dq.score < 60) {
                toast.warning(`"${item.file.name}": calidad de datos baja (DQ ${dq.score}/100)`, {
                  description: dq.issues.slice(0, 2).join(' · ') || 'Revisá las filas en el detalle.',
                  duration: 10000,
                });
              }
              const anomalies = detectAnomalies(parsedRows, finalCat);
              if (anomalies.outlierColumns.length > 0 || anomalies.hasMomChange || anomalies.hasDateGap) {
                const messages: string[] = [];
                if (anomalies.outlierColumns.length > 0) {
                  const top = anomalies.outlierColumns[0];
                  messages.push(`${top.count} valor(es) atípicos en "${top.column}" (máx ${top.max.toLocaleString('es-AR')})`);
                }
                if (anomalies.momDetail) {
                  messages.push(`Cambio ${anomalies.momDetail.ratio.toFixed(1)}× entre ${anomalies.momDetail.from} → ${anomalies.momDetail.to}`);
                }
                if (anomalies.gapDetail) {
                  messages.push(`Hueco de ${anomalies.gapDetail.days} días entre ${anomalies.gapDetail.start} y ${anomalies.gapDetail.end}`);
                }
                toast.warning(`"${item.file.name}": anomalías detectadas`, {
                  description: messages.join(' · '),
                  duration: 12000,
                });
              }
            } catch (dqErr) {
              console.warn('[CargaDatos] DQ/anomaly compute failed:', dqErr);
            }
          } catch (invokeErr: any) {
            await supabase.from('file_uploads').update({ status: 'queued', processing_error: null }).eq('id', dbData.id);
            console.warn('[CargaDatos] Row batch upload failed, queued for server retry:', invokeErr);
            updateItem({ status: 'done', progress: 100 });
            toast.info(`"${item.file.name}" re-encolado para procesar en el servidor`);
          }
        } else {
          updateItem({ status: 'done', progress: 100 });
          // 1.11: Audit log for upload — surface insert errors to console
          supabase.from('audit_logs').insert({
            company_id: profile!.company_id,
            user_id: user!.id,
            action: 'file_uploaded',
            resource_type: 'file_upload',
            metadata: { file_name: item.file.name, file_size: item.file.size },
          }).then(({ error: auditErr }) => {
            if (auditErr) console.error('[audit_logs] file_uploaded insert failed:', auditErr.message);
          });
          toast.success(`"${item.file.name}" en cola para procesar`);
        }
      } catch (err: any) {
        updateItem({ status: 'error', error: err.message });
      }

      await processNext();
    };

    for (let i = 0; i < Math.min(MAX_CONCURRENT_UPLOADS, filesToUpload.length); i++) {
      activePromises.push(processNext());
    }

    await Promise.all(activePromises);
    fetchFiles();
    fetchStorageUsage();
    await refetchExtractedData();

    // 1.7: Re-read FRESH data from DB before overlap detection. The closure
    // values (globalExtractedData / taggedVentasRows / etc.) were captured at
    // handleUpload time and are stale after refetchExtractedData() — React
    // hasn't re-rendered yet so we'd compare against pre-upload state.
    const freshAllRecords: { data_category: string; extracted_json: any; file_upload_id: string }[] = [];
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: page } = await supabase
          .from('file_extracted_data')
          .select('data_category, extracted_json, file_upload_id')
          .eq('company_id', profile.company_id!)
          .not('data_category', 'in', '("_raw_cache","_classification","_column_mapping")')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (!page || page.length === 0) break;
        freshAllRecords.push(...page);
        if (page.length < PAGE) break;
        from += PAGE;
      }
    }
    const freshByCat: Record<string, { row: any; fileUploadId: string }[]> = {
      ventas: [], gastos: [], marketing: [], stock: [],
    };
    for (const r of freshAllRecords) {
      const remapped = r.data_category === 'operaciones' ? 'gastos' : r.data_category === 'finanzas' ? 'facturas' : r.data_category;
      if (!freshByCat[remapped]) continue;
      const rows = (r.extracted_json as any)?.data || [];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) freshByCat[remapped].push({ row, fileUploadId: r.file_upload_id });
    }

    // Check for overlap after processing
    for (const item of queueItems) {
      if (item.status !== 'done') continue;
      try {
        // Get extracted data for this file
        const { data: newExtracted } = await supabase
          .from('file_extracted_data')
          .select('data_category, extracted_json, file_upload_id')
          .eq('company_id', profile.company_id!)
          .not('data_category', 'in', '("_raw_cache","_classification","_column_mapping")')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!newExtracted) continue;

        // Group by file_upload_id to find new rows
        for (const ext of newExtracted) {
          const cat = ext.data_category as string;
          const json = ext.extracted_json as any;
          const newRows = json?.data || [];
          if (!Array.isArray(newRows) || newRows.length === 0) continue;
          const newFileUploadId = ext.file_upload_id;

          // ─── BUG 1: Stock duplicate detection by product names ─────
          if (cat === 'stock') {
            // 1.7: use FRESH data and exclude rows from the file we just uploaded
            const existingStockRows = freshByCat.stock
              .filter(t => t.fileUploadId !== newFileUploadId)
              .map(t => t.row);
            // Skip if there's no prior stock to compare against
            if (existingStockRows.length === 0) continue;

            const stockMapping = globalMappings.stock;
            const newNames = new Set(
              newRows
                .map((r: any) => findString(r, FIELD_NAME, stockMapping?.name))
                .filter((n: string) => n && n.length > 0)
                .map((n: string) => n.trim().toLowerCase())
            );
            if (newNames.size === 0) continue;

            const existingNames = new Set(
              existingStockRows
                .map((r: any) => findString(r, FIELD_NAME, stockMapping?.name))
                .filter((n: string) => n && n.length > 0)
                .map((n: string) => n.trim().toLowerCase())
            );

            let matchCount = 0;
            for (const n of newNames) if (existingNames.has(n)) matchCount++;
            const matchPct = matchCount / newNames.size;

            if (matchPct > 0.8) {
              setStockDuplicateInfo({
                fileUploadId: newFileUploadId,
                fileName: item.file.name,
                matchPct,
                newProductCount: newNames.size,
              });
              break; // one dialog at a time
            }
            continue;
          }

          if (cat !== 'ventas' && cat !== 'gastos' && cat !== 'marketing') continue;

          // 1.7: use FRESH data fetched above, not stale closure tagged rows
          const existingRows = freshByCat[cat]
            .filter(t => t.fileUploadId !== newFileUploadId)
            .map(t => t.row);

          const catMapping = cat === 'ventas' ? globalMappings.ventas : cat === 'gastos' ? globalMappings.gastos : globalMappings.marketing;
          const finder = (row: any, kw: string[]) => findString(row, kw, catMapping?.date);
          const overlap = detectPeriodOverlap(existingRows, newRows, FIELD_DATE, finder);

          if (overlap.length > 0) {
            // 5.7: compute per-month diff (totals, rows, products) so the
            // dialog can show the user EXACTLY what changes if they replace.
            const diff = computeVersionDiff(existingRows, newRows, overlap, {
              date: catMapping?.date,
              amount: catMapping?.amount,
              name: catMapping?.name,
            });
            setOverlapInfo({
              fileUploadId: ext.file_upload_id,
              fileName: item.file.name,
              overlappingMonths: overlap,
              category: cat,
              diff,
            });
            break; // Show one overlap dialog at a time
          }
        }
      } catch (err) {
        console.warn('[CargaDatos] Overlap check failed:', err);
      }
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.company_id]);

  const handleReclassify = async (fileUploadId: string, newCategory: string) => {
    if (!profile?.company_id) return;
    try {
      // 5.16: capture old category for audit log before mutating
      const prevChunks = extractedDataMap[fileUploadId] || [];
      const oldCategory = prevChunks.find(c => !c.data_category.startsWith('_'))?.data_category ?? null;
      const fileNameForLog = files.find(f => f.id === fileUploadId)?.file_name ?? null;

      // 1.5: only update DATA records (skip the meta-rows _column_mapping,
      // _classification, _raw_cache — their data_category is structural).
      const { error } = await supabase
        .from('file_extracted_data')
        .update({ data_category: newCategory })
        .eq('file_upload_id', fileUploadId)
        .eq('company_id', profile.company_id)
        .not('data_category', 'in', '("_raw_cache","_classification","_column_mapping")');
      if (error) throw error;

      // 5.16: audit log for the reclassify event
      if (oldCategory !== newCategory) {
        supabase.from('audit_logs').insert({
          company_id: profile.company_id,
          user_id: user?.id,
          action: 'file_reclassified',
          resource_type: 'file_upload',
          resource_id: fileUploadId,
          metadata: { file_name: fileNameForLog, old_category: oldCategory, new_category: newCategory },
        }).then(({ error: auditErr }) => {
          if (auditErr) console.error('[audit_logs] file_reclassified insert failed:', auditErr.message);
        });
      }

      // Also remap the inner category inside the _column_mapping record so
      // useExtractedData merges the mapping under the new category bucket.
      const { data: mappingRecord } = await supabase
        .from('file_extracted_data')
        .select('id, extracted_json')
        .eq('file_upload_id', fileUploadId)
        .eq('company_id', profile.company_id)
        .eq('data_category', '_column_mapping')
        .maybeSingle();
      if (mappingRecord?.id) {
        const json = (mappingRecord.extracted_json as any) || {};
        const newJson = { ...json, category: newCategory };
        const { error: mapErr } = await supabase
          .from('file_extracted_data')
          .update({ extracted_json: newJson })
          .eq('id', mappingRecord.id);
        if (mapErr) console.error('[reclassify] failed to remap _column_mapping:', mapErr.message);
      }

      // Update local state
      setExtractedDataMap(prev => {
        const updated = { ...prev };
        if (updated[fileUploadId]) {
          updated[fileUploadId] = updated[fileUploadId].map(e =>
            e.data_category.startsWith('_') ? e : { ...e, data_category: newCategory }
          );
        }
        return updated;
      });
      refetchExtractedData();
      toast.success(`Categoría cambiada a "${categoryLabels[newCategory] || newCategory}"`);
    } catch (err: any) {
      toast.error('Error al reclasificar: ' + err.message);
    } finally {
      setReclassifyingId(null);
    }
  };

  // C5: Export processed data as CSV
  const handleExport = async (file: FileRecord) => {
    if (!profile?.company_id) return;
    try {
      const { data: chunks } = await supabase
        .from('file_extracted_data')
        .select('extracted_json, data_category')
        .eq('file_upload_id', file.id)
        .not('data_category', 'in', '("_raw_cache","_classification","_column_mapping")')
        .order('chunk_index', { ascending: true });

      if (!chunks || chunks.length === 0) { toast.error('No hay datos para exportar'); return; }

      // Merge all rows from all chunks
      const allRows: Record<string, unknown>[] = [];
      for (const chunk of chunks) {
        const json = chunk.extracted_json as any;
        const rows = json?.data;
        if (Array.isArray(rows)) allRows.push(...rows);
      }
      if (allRows.length === 0) { toast.error('No hay filas para exportar'); return; }

      // Build CSV
      const headers = Array.from(new Set(allRows.flatMap(r => Object.keys(r))));
      const csvRows = [
        headers.join(','),
        ...allRows.map(row =>
          headers.map(h => {
            const v = row[h];
            if (v === null || v === undefined) return '';
            const s = String(v).replace(/"/g, '""');
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
          }).join(',')
        ),
      ];
      const csvContent = csvRows.join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.file_name.replace(/\.[^.]+$/, '')}_exportado.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportado: ${allRows.length.toLocaleString('es-AR')} filas`);
    } catch (err: any) {
      toast.error('Error exportando: ' + err.message);
    }
  };

  // C4: Archivar — el archivo sigue en DB pero sus datos se excluyen del dashboard
  const handleArchive = async (file: FileRecord) => {
    try {
      const { error } = await supabase
        .from('file_uploads')
        .update({ status: 'archived' })
        .eq('id', file.id);
      if (error) throw error;
      await Promise.all([fetchFiles(), fetchArchivedFiles()]);
      await refetchExtractedData();
      toast.success('Archivo archivado. Sus datos ya no afectan el dashboard.');
    } catch (err: any) {
      toast.error('Error al archivar: ' + err.message);
    }
  };

  // C4: Restaurar — vuelve al estado procesado y reaparece en el dashboard
  const handleRestore = async (file: FileRecord) => {
    try {
      const { error } = await supabase
        .from('file_uploads')
        .update({ status: 'processed' })
        .eq('id', file.id);
      if (error) throw error;
      await Promise.all([fetchFiles(), fetchArchivedFiles()]);
      await refetchExtractedData();
      toast.success('Archivo restaurado. Sus datos vuelven al dashboard.');
    } catch (err: any) {
      toast.error('Error al restaurar: ' + err.message);
    }
  };

  // Ola 17: el delete real solo lo ejecuta el admin. Para employees,
  // abrimos un dialog que crea una delete_request y notifica al admin.
  const handleDelete = async (file: FileRecord) => {
    if (role !== 'admin') {
      setPendingDeleteRequest({ file, reason: '' });
      return;
    }
    return performAdminDelete(file);
  };

  const handleSubmitDeleteRequest = async () => {
    if (!pendingDeleteRequest) return;
    if (!pendingDeleteRequest.reason.trim()) {
      toast.error('Indicá un motivo para que el admin lo revise');
      return;
    }
    setSubmittingDeleteRequest(true);
    try {
      await requestDelete({ id: pendingDeleteRequest.file.id, name: pendingDeleteRequest.file.file_name }, pendingDeleteRequest.reason);
      toast.success('Solicitud de borrado enviada', {
        description: 'El admin recibirá la solicitud y la revisará.',
      });
      setPendingDeleteRequest(null);
    } catch (err) {
      const e = err as { message?: string };
      toast.error('Error al enviar solicitud', { description: e.message });
    } finally {
      setSubmittingDeleteRequest(false);
    }
  };

  const performAdminDelete = async (file: FileRecord) => {
    try {
      // 4.1: Delete in DB-first order so a failure in either DB step aborts
      // before we orphan storage. Only delete R2 once DB is consistent.
      // (Previous order: R2 first → if DB delete failed, the file looked alive
      // in the UI but had no storage backing it.)
      const { error: extErr } = await supabase.from('file_extracted_data').delete().eq('file_upload_id', file.id);
      if (extErr) throw extErr;
      const { error } = await supabase.from('file_uploads').delete().eq('id', file.id);
      if (error) throw error;

      // R2 delete is best-effort AFTER DB succeeds. A failure here is a
      // storage leak (recoverable via janitor) but never inconsistent state.
      let r2Failed = false;
      if (file.storage_path) {
        const { data, error: r2Error } = await supabase.functions.invoke('r2-delete', {
          body: { storagePath: file.storage_path },
        });
        if (r2Error || !data?.success) {
          console.warn('R2 delete warning:', r2Error?.message || data?.error);
          r2Failed = true;
        }
      }
      // 1.11: Audit log — surface insert errors to console for traceability
      await supabase.from('audit_logs').insert({
        company_id: profile?.company_id,
        user_id: user?.id,
        action: 'file_deleted',
        resource_type: 'file_upload',
        resource_id: file.id,
        metadata: { file_name: file.file_name, file_size: file.file_size },
      }).then(({ error: auditErr }) => {
        if (auditErr) console.error('[audit_logs] file_deleted insert failed:', auditErr.message);
      });
      if (r2Failed) {
        toast.warning('Archivo eliminado de la base, pero el archivo físico puede haber quedado en storage. Si el problema persiste, contactá a soporte.', { duration: 10000 });
      } else {
        toast.success('Archivo eliminado');
      }
      setFiles(prev => prev.filter(f => f.id !== file.id));
      setExtractedDataMap(prev => { const next = { ...prev }; delete next[file.id]; return next; });
    } catch (err: any) {
      toast.error('Error eliminando: ' + err.message);
    }
  };

  const handleCancel = async (file: FileRecord) => {
    try {
      const { error } = await supabase.from('file_uploads')
        .update({ status: 'cancelled', processing_error: 'Cancelado por el usuario' })
        .eq('id', file.id);
      if (error) throw error;
      toast.success(`"${file.file_name}" cancelado`);
      fetchFiles();
    } catch (err: any) {
      toast.error('Error cancelando: ' + err.message);
    }
  };

  const handleReprocess = async (file: FileRecord) => {
    if (!profile?.company_id) return;
    setReprocessingId(file.id);
    try {
      // 1.11: Audit log — surface insert errors to console for traceability
      supabase.from('audit_logs').insert({
        company_id: profile.company_id,
        user_id: user?.id,
        action: 'file_reprocessed',
        resource_type: 'file_upload',
        resource_id: file.id,
        metadata: { file_name: file.file_name },
      }).then(({ error: auditErr }) => {
        if (auditErr) console.error('[audit_logs] file_reprocessed insert failed:', auditErr.message);
      });
      await supabase.from('file_extracted_data').delete().eq('file_upload_id', file.id);
      
      const ext = file.file_name.split('.').pop()?.toLowerCase() || '';
      const isExcel = ['xls', 'xlsx'].includes(ext);
      
      if (isExcel && file.storage_path) {
        toast.info(`Descargando "${file.file_name}" para reprocesar...`);
        await supabase.from('file_uploads').update({ status: 'processing', processing_error: null, processing_started_at: new Date().toISOString(), next_chunk_index: 0 }).eq('id', file.id);
        await fetchFiles();
        
        try {
          const session = (await supabase.auth.getSession()).data.session;
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          const downloadUrl = `https://${projectId}.supabase.co/functions/v1/r2-download`;
          const dlResp = await fetch(downloadUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ fileUploadId: file.id }),
          });
          
          if (!dlResp.ok) throw new Error(`Error descargando [${dlResp.status}]`);
          const buffer = await dlResp.arrayBuffer();
          
          toast.info(`Parseando "${file.file_name}" localmente...`);
          const wb = XLSX.read(buffer, { type: 'array', dense: true, cellStyles: false, cellNF: false, cellText: false, sheetRows: 50000 });
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
            if (allRows.length >= 50000) break;
          }
          // 1.9: avisar al usuario si truncamos al reprocesar
          if (allRows.length > 50000) {
            toast.warning(`"${file.file_name}": el archivo tiene ${allRows.length.toLocaleString('es-AR')} filas. Solo se procesarán las primeras 50.000.`, { duration: 12000 });
            allRows.length = 50000;
          }
          
          if (allRows.length === 0) throw new Error('No se encontraron filas en el archivo');
          
          // Fix broken headers (title rows before real data)
          const fixed = fixBrokenHeaders(allRows);
          const fixedRows = fixed.rows;
          headers = fixed.headers;
          
          // Clean data: convert serial dates + filter summary rows
          const cleanedRows = cleanParsedRows(fixedRows, headers);
          console.log(`[CargaDatos] Reparse: ${cleanedRows.length} rows (cleaned from ${fixedRows.length}), ${headers.length} cols`);
          
          // Send in batches with category propagation
          const totalBatches = Math.ceil(cleanedRows.length / ROW_BATCH_SIZE);
          let resolvedCategory: string | undefined;
          for (let bi = 0; bi < totalBatches; bi++) {
            const batchRows = cleanedRows.slice(bi * ROW_BATCH_SIZE, (bi + 1) * ROW_BATCH_SIZE);
            const { data: pfData, error: pfError } = await supabase.functions.invoke('process-file', {
              body: {
                fileUploadId: file.id,
                companyId: profile.company_id!,
                rowBatch: batchRows,
                headers,
                batchIndex: bi,
                totalBatches,
                totalRows: fixedRows.length,
                ...(bi > 0 && resolvedCategory ? { category: resolvedCategory } : {}),
              },
            });
            if (pfError) throw pfError;
            if (bi === 0 && pfData?.category) {
              resolvedCategory = pfData.category;
            }
          }
          
          toast.success(`"${file.file_name}" procesado correctamente`);
        } catch (clientErr: any) {
          console.error('[CargaDatos] Client-side reprocess failed:', clientErr);
          await supabase.from('file_uploads').update({ status: 'queued', processing_error: null, processing_started_at: null }).eq('id', file.id);
          toast.info(`"${file.file_name}" re-encolado (el parseo local falló)`);
        }
      } else {
        await supabase.from('file_uploads').update({ status: 'queued', processing_error: null, processing_started_at: null }).eq('id', file.id);
        toast.success(`"${file.file_name}" re-encolado para procesar`);
      }
      
      await fetchFiles();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setReprocessingId(null);
    }
  };
  // ─── Handle Overlap Replace ────────────────────────────────
  const handleOverlapReplace = async () => {
    if (!overlapInfo || !profile?.company_id) return;
    try {
      // Find all other file_upload_ids that contributed data to the same category
      const { data: allExtracted } = await supabase
        .from('file_extracted_data')
        .select('id, file_upload_id, extracted_json')
        .eq('company_id', profile.company_id)
        .eq('data_category', overlapInfo.category)
        .neq('file_upload_id', overlapInfo.fileUploadId);

      if (!allExtracted) { setOverlapInfo(null); return; }

      const catMapping = overlapInfo.category === 'ventas' 
        ? globalMappings.ventas 
        : overlapInfo.category === 'marketing'
        ? globalMappings.marketing
        : globalMappings.gastos;
      const finder = (row: any, kw: string[]) => findString(row, kw, catMapping?.date);
      const overlapSet = new Set(overlapInfo.overlappingMonths);

      // For each old extracted record, filter out rows from overlapping months
      for (const ext of allExtracted) {
        const json = ext.extracted_json as any;
        const rows = json?.data || [];
        if (!Array.isArray(rows)) continue;

        const filtered = rows.filter((row: any) => {
          const raw = finder(row, FIELD_DATE);
          if (!raw) return true; // keep rows without dates
          const d = parseDate(raw);
          if (!d) return true;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          return !overlapSet.has(key);
        });

        if (filtered.length === 0) {
          // Delete the entire record
          await supabase.from('file_extracted_data').delete().eq('id', ext.id);
        } else if (filtered.length < rows.length) {
          // Update with filtered data
          await supabase.from('file_extracted_data').update({
            extracted_json: { ...json, data: filtered },
            row_count: filtered.length,
          }).eq('id', ext.id);
        }
      }

      toast.success(`Datos de ${overlapInfo.overlappingMonths.map(p => {
        const [y, m] = p.split('-');
        return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      }).join(', ')} reemplazados con los del nuevo archivo.`);
      setOverlapInfo(null);
      refetchExtractedData();
    } catch (err: any) {
      toast.error('Error reemplazando datos: ' + err.message);
      setOverlapInfo(null);
    }
  };

  // ─── BUG 1: Handle Stock Duplicate Replace ────────────────
  const handleStockDuplicateReplace = async () => {
    if (!stockDuplicateInfo || !profile?.company_id) return;
    try {
      // Delete all prior stock data records (keep only the new file's data)
      await supabase
        .from('file_extracted_data')
        .delete()
        .eq('company_id', profile.company_id)
        .eq('data_category', 'stock')
        .neq('file_upload_id', stockDuplicateInfo.fileUploadId);

      toast.success(`Inventario anterior reemplazado con los ${stockDuplicateInfo.newProductCount} productos del nuevo archivo.`);
      setStockDuplicateInfo(null);
      refetchExtractedData();
    } catch (err: any) {
      toast.error('Error reemplazando inventario: ' + err.message);
      setStockDuplicateInfo(null);
    }
  };


  const handleImportUrls = async () => {
    if (!user || !profile?.company_id || !urlImportText.trim()) return;
    setIsImportingUrls(true);
    try {
      const lines = urlImportText.trim().split('\n').filter(l => l.trim());
      const urls = lines.map(line => {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 2) return { url: parts[0], name: parts[1] };
        return parts[0];
      });

      // 1.12: Validar que todos los URLs sean http/https — defensa en profundidad contra file://, javascript:, etc.
      const invalidUrls = urls.filter(u => {
        const url = typeof u === 'string' ? u : u.url;
        return !/^https?:\/\//i.test(url || '');
      });
      if (invalidUrls.length > 0) {
        toast.error('URL(s) inválida(s): solo se aceptan enlaces http:// o https://', { duration: 8000 });
        setIsImportingUrls(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('import-url', {
        body: { urls, userId: user.id, companyId: profile.company_id },
      });

      if (error) throw error;
      toast.success(`${data.imported} archivo(s) importado(s)${data.failed > 0 ? `, ${data.failed} fallaron` : ''}`);
      setUrlImportText('');
      setShowUrlImport(false);
      fetchFiles();
    } catch (err: any) {
      toast.error('Error importando: ' + err.message);
    } finally {
      setIsImportingUrls(false);
    }
  };

  // ─── Priority Handler ─────────────────────────────────────
  const handlePrioritize = async (file: FileRecord) => {
    try {
      const { error } = await supabase.from('file_uploads')
        .update({ priority: 1 })
        .eq('id', file.id);
      if (error) throw error;
      toast.success(`"${file.file_name}" priorizado`);
      fetchFiles();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const isUploading = uploadQueue.some(i => i.status === 'pending' || i.status === 'uploading' || i.status === 'processing');
  // C4: Split active vs archived files
  // 5.14: also apply client-side categoryFilter (from ?category= URL param) by
  // peeking at the first non-meta extracted chunk's data_category.
  const activeFilesList = useMemo(() => {
    const base = files.filter(f => f.status !== 'archived');
    if (categoryFilter === 'all') return base;
    return base.filter(f => {
      const chunks = extractedDataMap[f.id] || [];
      return chunks.some(c => c.data_category === categoryFilter);
    });
  }, [files, extractedDataMap, categoryFilter]);

  // 5.9: Bulk recategorize — runs handleReclassify for each selected file
  // sequentially so toasts and refetch are coherent.
  const handleBulkRecategorize = async (newCategory: string) => {
    if (selectedIds.size === 0) return;
    setBulkRecategorizing(true);
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      try {
        await handleReclassify(id, newCategory);
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkRecategorizing(false);
    setSelectedIds(new Set());
    if (fail === 0) toast.success(`${ok} archivo(s) reclasificados`);
    else toast.warning(`${ok} reclasificados, ${fail} fallaron`);
  };

  // 5.9: Toggle/select-all helpers
  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const visibleIds = activeFilesList
        .filter(f => f.status === 'processed' || f.status === 'review' || f.status === 'processed_with_issues')
        .map(f => f.id);
      const allSelected = visibleIds.every(id => prev.has(id));
      if (allSelected) return new Set();
      return new Set(visibleIds);
    });
  };

  const statusLabel = (status: string | null) => {
    switch (status) {
      case 'processed': return 'Procesado';
      case 'processed_with_issues': return 'Procesado con advertencias';
      case 'error': return 'Error';
      case 'queued': return 'En cola';
      case 'processing': return 'Procesando';
      case 'cancelled': return 'Cancelado';
      case 'review': return 'Pendiente de revisión';
      default: return status || 'Desconocido';
    }
  };

  const statusColor = (status: string | null) => {
    switch (status) {
      case 'processed': return 'bg-success/15 text-success';
      case 'processed_with_issues': return 'bg-warning/15 text-warning';
      case 'error': return 'bg-destructive/15 text-destructive';
      case 'queued': return 'bg-muted text-muted-foreground';
      case 'cancelled': return 'bg-muted text-muted-foreground';
      case 'review': return 'bg-warning/15 text-warning';
      default: return 'bg-warning/15 text-warning';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Carga de Datos</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Storage Usage Bar */}
          {storageUsedBytes > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <BarChart3 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">Almacenamiento</span>
                  <span className="text-xs text-muted-foreground">
                    {(storageUsedBytes / 1024 / 1024 / 1024).toFixed(2)} GB de 5 GB
                  </span>
                </div>
                <Progress value={Math.min((storageUsedBytes / MAX_STORAGE_BYTES) * 100, 100)} className="h-1.5" />
              </div>
            </div>
          )}

          {/* Status Dashboard */}
          <StatusDashboard files={files} totalCount={totalCount} archivedCount={archivedFiles.length} />
          <FreshnessPanel lastUploadDates={lastUploadDates} />

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${dragInvalidMsg ? 'border-destructive bg-destructive/5' : dragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/50'} ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
              // 2.2: inspect dataTransfer items to flag invalid types during drag
              const items = e.dataTransfer.items;
              if (items && items.length > 0) {
                const ACCEPTED_MIME = /^(application\/(pdf|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|msword|xml|x-xml)|text\/(csv|xml|plain)|image\/(png|jpeg|webp|gif|bmp))$/;
                let invalidCount = 0;
                let totalFileItems = 0;
                for (let i = 0; i < items.length; i++) {
                  if (items[i].kind !== 'file') continue;
                  totalFileItems++;
                  if (items[i].type && !ACCEPTED_MIME.test(items[i].type)) invalidCount++;
                }
                if (totalFileItems > 0 && invalidCount === totalFileItems) {
                  setDragInvalidMsg('Formato no compatible. Soltá un Excel, CSV, PDF, imagen, Word o XML.');
                } else if (invalidCount > 0) {
                  setDragInvalidMsg(`${invalidCount} archivo${invalidCount === 1 ? '' : 's'} se ignorará${invalidCount === 1 ? '' : 'n'}: formato no compatible.`);
                } else {
                  setDragInvalidMsg(null);
                }
              }
            }}
            onDragLeave={() => { setDragging(false); setDragInvalidMsg(null); }}
            onDrop={(e) => { setDragInvalidMsg(null); handleDrop(e); }}
            onClick={() => !isUploading && document.getElementById('file-input')?.click()}
          >
            {isUploading ? (
              <Loader2 className="h-10 w-10 mx-auto text-primary mb-3 animate-spin" />
            ) : dragInvalidMsg ? (
              <AlertTriangle className="h-10 w-10 mx-auto text-destructive mb-3" />
            ) : (
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            )}
            <p className={`font-medium ${dragInvalidMsg ? 'text-destructive' : ''}`}>
              {isUploading ? 'Subiendo archivos...' : dragInvalidMsg ?? 'Arrastrá archivos acá o hacé click para seleccionar'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Podés seleccionar muchos a la vez.</p>
            <p className="text-xs text-muted-foreground mt-2">Formatos aceptados: Excel (.xlsx, .xls), CSV (.csv), PDF (.pdf), Imágenes (.png, .jpg, .webp, .gif, .bmp), Word (.doc, .docx), XML (.xml) — Máx. 50MB por archivo. Sin límite de filas (se procesan automáticamente en bloques).</p>
            <input
              id="file-input"
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.csv,.xls,.xlsx,.xlsm,.png,.jpg,.jpeg,.webp,.gif,.bmp,.doc,.docx,.xml,.txt"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  uploadFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
          </div>

          {/* 5.12 + Ola 9: Downloadable templates — más visibles, con descripción y CTA claro */}
          <div className="mt-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl" aria-hidden>📋</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold">¿No tenés un archivo todavía? Bajá una plantilla</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cada plantilla viene con las columnas exactas que el sistema reconoce. Llenala con tus datos y subila acá.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { downloadTemplate(t); toast.success(`Plantilla "${t.label}" descargada`); }}
                  className="group flex flex-col items-start gap-1 px-3 py-2.5 rounded-lg border bg-background hover:bg-muted hover:border-primary/40 transition-colors text-left"
                  title={t.description}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <span className="text-base" aria-hidden>{t.emoji}</span>
                    <span className="text-xs font-semibold truncate flex-1">{t.label}</span>
                    <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors shrink-0">↓</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground line-clamp-2 leading-snug">{t.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ola 17: Banner para admin con solicitudes de borrado pendientes */}
          {role === 'admin' && deletePending.length > 0 && (
            <Card className="border-warning/40 bg-warning/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  {deletePending.length} solicitud{deletePending.length === 1 ? '' : 'es'} de borrado pendiente{deletePending.length === 1 ? '' : 's'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {deletePending.map(req => (
                  <div key={req.id} className="flex items-start gap-2 p-2 rounded-md bg-background border text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{req.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Solicitado por <strong>{req.requester_name || 'Usuario'}</strong>
                        {req.reason && <> · "<span className="italic">{req.reason}</span>"</>}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={async () => {
                        try {
                          await rejectRequest(req, 'Rechazado');
                          toast.success('Solicitud rechazada');
                        } catch (err) {
                          const e = err as { message?: string };
                          toast.error('Error', { description: e.message });
                        }
                      }}
                    >
                      Rechazar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={async () => {
                        try {
                          await approveRequest(req);
                          toast.success(`"${req.file_name}" eliminado`);
                          fetchFiles();
                        } catch (err) {
                          const e = err as { message?: string };
                          toast.error('Error al aprobar', { description: e.message });
                        }
                      }}
                    >
                      Aprobar y borrar
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Upload Queue */}
          <UploadQueue items={uploadQueue} onDismiss={() => setUploadQueue([])} />
          {/* URL Import */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUrlImport(!showUrlImport)}
              className="gap-1.5"
            >
              <Globe className="h-3.5 w-3.5" />
              Importar por URL
            </Button>
          </div>

          {showUrlImport && (
            <Card className="border-primary/20">
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm font-medium">Importar archivos desde URLs</p>
                <p className="text-xs text-muted-foreground">
                  Pegá una URL por línea. Para nombrar el archivo: <code className="bg-muted px-1 rounded">url, nombre</code>. Soporta Google Drive, Dropbox y enlaces directos.
                </p>
                <Textarea
                  placeholder={"https://drive.google.com/file/d/abc123/view\nhttps://example.com/report.csv, reporte-ventas.csv"}
                  value={urlImportText}
                  onChange={e => setUrlImportText(e.target.value)}
                  rows={4}
                  className="text-sm font-mono"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setShowUrlImport(false); setUrlImportText(''); }}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleImportUrls}
                    disabled={isImportingUrls || !urlImportText.trim()}
                    className="gap-1.5"
                  >
                    {isImportingUrls ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    {isImportingUrls ? 'Importando...' : 'Importar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(0); }}
                className="pl-8 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(0); }}>
              <SelectTrigger className="w-[140px] h-9">
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="processed">Procesados</SelectItem>
                <SelectItem value="processing">Procesando</SelectItem>
                <SelectItem value="queued">En cola</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="review">Pendiente revisión</SelectItem>
                <SelectItem value="processed_with_issues">Con advertencias</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setCurrentPage(0); }}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="PDF">PDF</SelectItem>
                <SelectItem value="CSV">CSV</SelectItem>
                <SelectItem value="XLS">Excel</SelectItem>
                <SelectItem value="Imagen">Imagen</SelectItem>
                <SelectItem value="Word">Word</SelectItem>
                <SelectItem value="XML">XML</SelectItem>
              </SelectContent>
            </Select>
            {/* 5.14 Lineage: category filter (driven by ?category= URL param) */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {Object.entries(categoryLabels).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categoryFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className="text-[11px] underline text-muted-foreground hover:text-foreground"
                title="Quitar filtro de categoría"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* 5.9 Bulk action bar — appears when at least one file is selected */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/5">
              <span className="text-sm font-medium">
                {selectedIds.size} archivo{selectedIds.size === 1 ? '' : 's'} seleccionado{selectedIds.size === 1 ? '' : 's'}
              </span>
              <div className="flex-1" />
              <Select onValueChange={handleBulkRecategorize} disabled={bulkRecategorizing}>
                <SelectTrigger className="w-[200px] h-8">
                  <SelectValue placeholder={bulkRecategorizing ? 'Aplicando...' : 'Cambiar categoría a...'} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkRecategorizing}
              >
                Cancelar
              </Button>
            </div>
          )}

          {/* File List */}
          <Card id="historial-cargas-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Historial de cargas {totalCount > 0 && `(${totalCount})`}
                  {categoryFilter !== 'all' && (
                    <span className="ml-2 text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      Categoría: {categoryLabels[categoryFilter] || categoryFilter}
                    </span>
                  )}
                </CardTitle>
                {/* 5.9 select-all toggle (only for processed files) */}
                {activeFilesList.some(f => f.status === 'processed' || f.status === 'review' || f.status === 'processed_with_issues') && (
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline"
                  >
                    {selectedIds.size > 0 ? 'Deseleccionar' : 'Seleccionar visibles'}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingFiles ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {activeFilesList.map(f => {
                    const Icon = fileIcons[f.file_type || ''] || FileText;
                    const isReprocessing = reprocessingId === f.id;
                    const extractedChunks = extractedDataMap[f.id];
                    const hasChunks = extractedChunks && extractedChunks.length > 1;
                    const firstExtracted = extractedChunks?.[0];
                    const totalExtractedRows = extractedChunks?.reduce((sum, c) => sum + (c.row_count || 0), 0) || 0;

                    const isBulkable = f.status === 'processed' || f.status === 'review' || f.status === 'processed_with_issues';
                    const isSelected = selectedIds.has(f.id);
                    return (
                      <div key={f.id} className={`p-3 rounded-lg hover:bg-muted/50 transition-colors ${isSelected ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`}>
                        <div className="flex items-center gap-3 text-sm">
                          {/* 5.9 selection checkbox (only for files that can be reclassified) */}
                          {isBulkable && (
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-input shrink-0 cursor-pointer accent-primary"
                              checked={isSelected}
                              onChange={() => toggleSelected(f.id)}
                              aria-label={`Seleccionar ${f.file_name}`}
                            />
                          )}
                          <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{f.file_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {f.created_at ? formatDate(f.created_at) : '—'}
                              {f.file_size ? ` · ${f.file_size > 1024 * 1024 ? `${(f.file_size / 1024 / 1024).toFixed(1)} MB` : `${(f.file_size / 1024).toFixed(0)} KB`}` : ''}
                            </p>
                            {(f.status === 'error' || f.status === 'review' || f.status === 'processed_with_issues') && f.processing_error && f.processing_error !== RATE_LIMIT_MESSAGE && (
                              <p className={`text-xs mt-0.5 whitespace-pre-wrap break-words ${f.status === 'error' ? 'text-destructive' : 'text-warning'}`}>{sanitizeError(f.processing_error)}</p>
                            )}
                          </div>
                          <Badge className={`border-0 shrink-0 ${f.status === 'queued' && f.processing_error === RATE_LIMIT_MESSAGE ? 'bg-warning/15 text-warning' : statusColor(f.status)}`}>
                            {f.status === 'queued' && f.processing_error === RATE_LIMIT_MESSAGE ? (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                En cola — esperando disponibilidad
                              </span>
                            ) : f.status === 'processing' && f.next_chunk_index && f.total_chunks
                              ? `Bloque ${f.next_chunk_index}/${f.total_chunks}`
                              : statusLabel(f.status)}
                          </Badge>
                          {/* 5.2: DQ badge — only renders if score is in cache */}
                          {dqScoresMap[f.id] && (f.status === 'processed' || f.status === 'review' || f.status === 'processed_with_issues') && (
                            <DataQualityBadge dq={dqScoresMap[f.id]} />
                          )}
                          {(f.status === 'queued') && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 h-8 w-8 text-muted-foreground hover:text-primary"
                                onClick={() => handlePrioritize(f)}
                                title="Priorizar"
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => handleCancel(f)}
                                title="Cancelar"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {(f.status === 'error' || f.status === 'processed' || f.status === 'cancelled' || f.status === 'review' || f.status === 'processed_with_issues') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0 h-8 w-8"
                              onClick={() => handleReprocess(f)}
                              disabled={isReprocessing}
                              title="Reprocesar"
                            >
                              {isReprocessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            </Button>
                          )}
                          {(f.status === 'processed' || f.status === 'review' || f.status === 'processed_with_issues') && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 h-8 w-8 text-muted-foreground hover:text-primary"
                                onClick={() => handleExport(f)}
                                title="Exportar datos como CSV"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 h-8 w-8 text-muted-foreground hover:text-warning"
                                onClick={() => handleArchive(f)}
                                title="Archivar (excluir del dashboard sin borrar)"
                              >
                                <Archive className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {f.status === 'processing' && f.processing_started_at && (Date.now() - new Date(f.processing_started_at).getTime() > 5 * 60 * 1000) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0 h-8 w-8 text-warning hover:text-destructive"
                              onClick={() => handleReprocess(f)}
                              disabled={isReprocessing}
                              title="Forzar reproceso (atascado)"
                            >
                              {isReprocessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => handleDelete(f)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {firstExtracted && (f.status === 'processed' || f.status === 'review' || f.status === 'processed_with_issues') && (
                          <div className={`mt-2 ml-8 flex items-start gap-2 text-xs text-muted-foreground rounded-md p-2 ${f.status === 'processed_with_issues' || f.status === 'review' ? 'bg-warning/10 border border-warning/20' : 'bg-muted/30'}`}>
                            {f.status === 'processed_with_issues' || f.status === 'review' ? (
                              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {reclassifyingId === f.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <Select
                                      defaultValue={firstExtracted.data_category}
                                      onValueChange={(val) => {
                                        // 2.4: pedir confirmación antes de aplicar (evita mis-clicks que rompan dashboard)
                                        if (val !== firstExtracted.data_category) {
                                          setPendingReclassify({
                                            fileId: f.id,
                                            fileName: f.file_name,
                                            newCategory: val,
                                            oldCategory: firstExtracted.data_category,
                                          });
                                        } else {
                                          setReclassifyingId(null);
                                        }
                                      }}
                                    >
                                      <SelectTrigger className="h-6 text-xs w-36 border-primary/50">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {Object.entries(categoryLabels).map(([val, label]) => (
                                          <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <button
                                      type="button"
                                      onClick={() => setReclassifyingId(null)}
                                      className="text-muted-foreground hover:text-foreground"
                                    >
                                      <XIcon className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-foreground">
                                      {categoryLabels[firstExtracted.data_category] || firstExtracted.data_category}
                                    </span>
                                    <button
                                      type="button"
                                      title="Cambiar categoría"
                                      onClick={() => setReclassifyingId(f.id)}
                                      className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                                {totalExtractedRows > 0 && <span>· {totalExtractedRows} filas</span>}
                                {hasChunks && (
                                  <Badge variant="outline" className="h-5 text-[10px] gap-1">
                                    <Layers className="h-3 w-3" />
                                    {extractedChunks.length} bloques
                                  </Badge>
                                )}
                              </div>
                              {f.status === 'review' && (
                                <p className="mt-1 text-warning font-medium">
                                  La IA clasificó este archivo con baja confianza. Verificá que la categoría sea correcta y reclasificá si es necesario.
                                </p>
                              )}
                              {firstExtracted.summary && (
                                <p className="mt-0.5 leading-relaxed">{firstExtracted.summary}</p>
                              )}
                              {/* B3: Column mapping preview chips */}
                              {columnMappingMap[f.id] && Object.keys(columnMappingMap[f.id]).length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {Object.entries(columnMappingMap[f.id]).slice(0, 6).map(([k, v]) => (
                                    <span key={k} className="inline-flex items-center gap-1 text-[10px] bg-muted/60 border border-border/50 rounded px-1.5 py-0.5 max-w-[200px]">
                                      <span className="text-muted-foreground shrink-0">{semanticLabel(k)}</span>
                                      <span className="text-muted-foreground/40 shrink-0">→</span>
                                      <span className="font-medium truncate">{v}</span>
                                    </span>
                                  ))}
                                  {Object.keys(columnMappingMap[f.id]).length > 6 && (
                                    <span className="text-[10px] text-muted-foreground self-center">
                                      +{Object.keys(columnMappingMap[f.id]).length - 6} más
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {activeFilesList.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {searchTerm || statusFilter !== 'all' || typeFilter !== 'all'
                        ? 'No hay archivos que coincidan con los filtros'
                        : 'No hay archivos cargados todavía'}
                    </p>
                  )}

                  {/* C4: Historial de versiones — siempre visible independientemente de filtros */}
                  {archivedFiles.length > 0 && (
                    <div className="mt-5">
                      <div className="rounded-2xl border border-border/50 bg-gradient-to-b from-muted/20 to-muted/5 overflow-hidden">
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-muted border border-border/60">
                            <History className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold">Historial de versiones</p>
                            <p className="text-[10px] text-muted-foreground">
                              {archivedFiles.length} archivo{archivedFiles.length !== 1 ? 's' : ''} archivado{archivedFiles.length !== 1 ? 's' : ''} · excluidos del dashboard
                            </p>
                          </div>
                          <div className="shrink-0 px-2.5 py-1 rounded-lg bg-muted/80 border border-border/50">
                            <p className="text-[10px] font-bold text-muted-foreground">{archivedFiles.length}</p>
                          </div>
                        </div>

                        {/* File rows */}
                        <div className="divide-y divide-border/25">
                          {archivedFiles.map(f => {
                            const Icon = fileIcons[f.file_type || ''] || FileText;
                            const chunks = extractedDataMap[f.id] || [];
                            const firstExtracted = chunks.find(c => c.data_category !== '_column_mapping' && c.data_category !== '_raw_cache') || chunks[0];
                            const totalRows = chunks.reduce((s, c) => s + (c.row_count || 0), 0);
                            const catKey = firstExtracted?.data_category || '';
                            const modules = CATEGORY_MODULES[catKey] || [];
                            const summaryText = firstExtracted?.summary;
                            const dateLabel = f.created_at
                              ? new Date(f.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })
                              : '';

                            return (
                              <div
                                key={f.id}
                                className="group px-4 py-3 flex items-center gap-3 hover:bg-muted/25 transition-colors"
                              >
                                {/* File type icon */}
                                <div className="shrink-0 h-8 w-8 rounded-xl bg-muted/60 border border-border/50 flex items-center justify-center">
                                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>

                                {/* Info block */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs font-medium truncate max-w-[200px] sm:max-w-xs">{f.file_name}</p>
                                    {catKey && (
                                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted border border-border/60 text-muted-foreground whitespace-nowrap">
                                        {categoryLabels[catKey] || catKey}
                                      </span>
                                    )}
                                    {totalRows > 0 && (
                                      <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                                        {totalRows.toLocaleString('es-AR')} filas
                                      </span>
                                    )}
                                    {dateLabel && (
                                      <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">{dateLabel}</span>
                                    )}
                                  </div>
                                  {summaryText && (
                                    <p className="text-[10px] text-muted-foreground/55 mt-0.5 line-clamp-1 italic">{summaryText}</p>
                                  )}
                                  {modules.length > 0 && (
                                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                      <Link2 className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
                                      {modules.map(m => (
                                        <span
                                          key={m}
                                          className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary/5 border border-primary/15 text-primary/60 font-medium"
                                        >
                                          {m}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Action buttons — revealed on hover */}
                                <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[10px] gap-1.5 border-success/35 text-success hover:bg-success/10 hover:border-success/50"
                                    onClick={() => handleRestore(f)}
                                    title="Restaurar — vuelve al dashboard"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    Restaurar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDelete(f)}
                                    title="Eliminar definitivamente"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <p className="text-xs text-muted-foreground">
                    Página {currentPage + 1} de {totalPages}
                  </p>
                  <div className="flex gap-1">
                    {/* 2.10: Scroll to top of list when changing pages */}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={currentPage === 0}
                      onClick={() => {
                        setCurrentPage(p => p - 1);
                        document.getElementById('historial-cargas-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={currentPage >= totalPages - 1}
                      onClick={() => {
                        setCurrentPage(p => p + 1);
                        document.getElementById('historial-cargas-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 5.16 Audit trail — collapsed by default, opens on demand */}
          <AuditTrailPanel companyId={profile?.company_id} refreshKey={files.length} />
        </div>

        <ContextualAssistant companySettings={companySettings} lastUploadDates={lastUploadDates} />
      </div>

      {/* Overlap detection dialog */}
      <AlertDialog open={!!overlapInfo} onOpenChange={(open) => { if (!open) setOverlapInfo(null); }}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-warning" />
              Comparar versiones — {overlapInfo?.fileName}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm">
                  El archivo contiene datos de períodos ya cargados. Antes de decidir, mirá qué <strong>cambia</strong>:
                </p>
                {/* 5.7: Per-month diff table */}
                {overlapInfo?.diff && overlapInfo.diff.perMonth.length > 0 && (
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium">Período</th>
                          <th className="text-right px-2 py-1.5 font-medium">Filas</th>
                          <th className="text-right px-2 py-1.5 font-medium">Total</th>
                          <th className="text-right px-2 py-1.5 font-medium">Δ</th>
                          <th className="text-right px-2 py-1.5 font-medium">Productos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overlapInfo.diff.perMonth.map(d => {
                          const [y, m] = d.month.split('-');
                          const label = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
                          const deltaColor = d.totalDeltaPct > 5 ? 'text-success'
                            : d.totalDeltaPct < -5 ? 'text-destructive'
                            : 'text-muted-foreground';
                          const deltaSign = d.totalDeltaPct > 0 ? '+' : '';
                          return (
                            <tr key={d.month} className="border-t">
                              <td className="px-2 py-1.5 font-medium">{label}</td>
                              <td className="px-2 py-1.5 text-right font-mono">
                                <span className="text-muted-foreground">{d.oldRowCount}</span>
                                <span className="mx-1 text-muted-foreground/50">→</span>
                                {d.newRowCount}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono">
                                ${d.newTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                              </td>
                              <td className={`px-2 py-1.5 text-right font-mono font-semibold ${deltaColor}`}>
                                {deltaSign}{d.totalDeltaPct.toFixed(1)}%
                              </td>
                              <td className="px-2 py-1.5 text-right text-xs">
                                {d.newProductsAdded > 0 && <span className="text-success">+{d.newProductsAdded}</span>}
                                {d.newProductsAdded > 0 && d.productsRemoved > 0 && <span className="text-muted-foreground"> · </span>}
                                {d.productsRemoved > 0 && <span className="text-destructive">-{d.productsRemoved}</span>}
                                {d.newProductsAdded === 0 && d.productsRemoved === 0 && <span className="text-muted-foreground">=</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex gap-3 text-xs text-muted-foreground bg-muted/40 rounded-md p-2">
                  <span><strong>Reemplazar:</strong> los datos antiguos de esos meses se borran y quedan los nuevos.</span>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground bg-muted/40 rounded-md p-2">
                  <span><strong>Mantener ambos:</strong> los archivos coexisten — el dashboard sumará valores de ambos (puede generar duplicados).</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOverlapInfo(null)}>
              Mantener ambos
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleOverlapReplace} className="bg-warning text-warning-foreground hover:bg-warning/90">
              Reemplazar versiones antiguas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ola 12: Multi-hoja picker — antes de procesar Excel con varias hojas válidas */}
      <MultiSheetPickerDialog
        open={!!pendingSheets}
        fileName={pendingSheets?.fileName ?? ''}
        sheets={pendingSheets?.sheets ?? []}
        onConfirm={handleSheetsConfirm}
        onCancel={handleSheetsCancel}
      />

      {/* Ola 17: dialog de solicitud de borrado (solo employees) */}
      <AlertDialog open={!!pendingDeleteRequest} onOpenChange={(open) => { if (!open) setPendingDeleteRequest(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Solicitar borrado de archivo
            </AlertDialogTitle>
            <AlertDialogDescription>
              Solo el admin puede borrar archivos. Tu solicitud se enviará para revisión con el motivo que escribas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDeleteRequest && (
            <div className="space-y-2 py-2">
              <p className="text-sm font-medium">Archivo: <span className="font-mono text-xs">{pendingDeleteRequest.file.file_name}</span></p>
              <div className="space-y-1">
                <Label htmlFor="delete-reason" className="text-sm">¿Por qué querés borrarlo?</Label>
                <Textarea
                  id="delete-reason"
                  value={pendingDeleteRequest.reason}
                  onChange={(e) => setPendingDeleteRequest(prev => prev ? { ...prev, reason: e.target.value } : prev)}
                  rows={3}
                  placeholder="Ej: archivo duplicado, datos incorrectos, etc."
                  disabled={submittingDeleteRequest}
                />
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingDeleteRequest}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleSubmitDeleteRequest(); }} disabled={submittingDeleteRequest}>
              {submittingDeleteRequest ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar solicitud'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 5.1: Schema Preview & Confirmation dialog */}
      <SchemaPreviewDialog
        open={!!pendingPreview}
        payload={pendingPreview?.payload ?? null}
        selectedCategory={pendingPreview?.category ?? 'otro'}
        onCategoryChange={(cat) => setPendingPreview(prev => prev ? { ...prev, category: cat } : prev)}
        onConfirm={handlePreviewConfirm}
        onCancel={handlePreviewCancel}
        categoryLabels={categoryLabels}
      />

      {/* 2.4: Reclassify confirmation dialog */}
      <AlertDialog open={!!pendingReclassify} onOpenChange={(open) => { if (!open) { setPendingReclassify(null); setReclassifyingId(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Confirmar reclasificación
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Vas a cambiar la categoría de <strong>"{pendingReclassify?.fileName}"</strong>:
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="px-2 py-0.5 rounded-md bg-muted border text-muted-foreground">
                    {categoryLabels[pendingReclassify?.oldCategory || ''] || pendingReclassify?.oldCategory}
                  </span>
                  <span className="text-muted-foreground/50">→</span>
                  <span className="px-2 py-0.5 rounded-md bg-warning/10 border border-warning/30 font-medium">
                    {categoryLabels[pendingReclassify?.newCategory || ''] || pendingReclassify?.newCategory}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  Esto va a recalcular los módulos del dashboard que usan estos datos. Los valores se mueven a la nueva categoría inmediatamente.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setPendingReclassify(null); setReclassifyingId(null); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingReclassify) {
                  handleReclassify(pendingReclassify.fileId, pendingReclassify.newCategory);
                  setPendingReclassify(null);
                }
              }}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              Confirmar cambio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* BUG 1: Stock duplicate dialog */}
      <AlertDialog open={!!stockDuplicateInfo} onOpenChange={(open) => { if (!open) setStockDuplicateInfo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-warning" />
              Productos ya cargados
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  El archivo <strong>"{stockDuplicateInfo?.fileName}"</strong> parece contener productos ya cargados
                  ({stockDuplicateInfo ? Math.round(stockDuplicateInfo.matchPct * 100) : 0}% de coincidencia con el inventario actual).
                </p>
                <p className="text-muted-foreground">
                  ¿Querés reemplazar el inventario actual con estos productos, o agregarlos manteniendo ambos?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setStockDuplicateInfo(null)}>
              Agregar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleStockDuplicateReplace} className="bg-warning text-warning-foreground hover:bg-warning/90">
              Reemplazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
