import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, Image, FileSpreadsheet, Trash2, Lightbulb, Loader2, RefreshCw, CheckCircle2, Search, ChevronLeft, ChevronRight, Filter, XCircle, BarChart3, Clock, AlertTriangle, Layers, Link2, ArrowUp, Globe } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/formatters';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { cleanParsedRows, detectPeriodOverlap, parseDate } from '@/lib/data-cleaning';
import { useExtractedData } from '@/hooks/useExtractedData';
import { findString, FIELD_DATE, FIELD_NAME } from '@/lib/field-utils';
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
 * Simple RFC 4180 CSV parser for client-side use.
 */
function parseCSVClientSide(text: string): Record<string, unknown>[] {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM
  const rawFirst = text.split(/\r?\n/)[0] || '';
  const delimiter = rawFirst.includes('\t') ? '\t' : rawFirst.includes(';') ? ';' : ',';

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

function ContextualAssistant({ companySettings }: { companySettings: any }) {
  const suggestions: SuggestionItem[] = [
    { icon: '📊', title: 'Hoja de ventas', description: 'Subí tu Excel o CSV con las ventas del mes para calcular facturación, ticket promedio y tendencias.', condition: true, priority: 'high' },
    { icon: '💰', title: 'Facturas de proveedores', description: 'Subí PDFs o fotos de facturas para registrar costos y calcular tu margen real.', condition: true, priority: 'high' },
    { icon: '📦', title: 'Lista de productos / stock', description: 'Subí tu inventario con cantidades, precios y costos para detectar faltantes y sobrestock.', condition: !companySettings || companySettings.sells_products || companySettings.has_stock, priority: 'high' },
    { icon: '📈', title: 'Reporte de Meta Ads', description: 'Exportá el rendimiento de campañas desde Meta Business Suite y subilo acá.', condition: !companySettings || companySettings.uses_meta_ads, priority: 'medium' },
    { icon: '🔍', title: 'Reporte de Google Ads', description: 'Descargá el informe de rendimiento desde Google Ads y subilo para analizar ROAS.', condition: !companySettings || companySettings.uses_google_ads, priority: 'medium' },
    { icon: '🚚', title: 'Registro de envíos', description: 'Si tenés un registro de despachos o logística, subilo para cruzar con ventas.', condition: !companySettings || companySettings.has_logistics, priority: 'low' },
    { icon: '🏦', title: 'Resumen bancario', description: 'Subí tu extracto bancario (CSV o PDF) para conciliar ingresos y egresos.', condition: true, priority: 'low' },
  ];

  const activeSuggestions = suggestions.filter(s => s.condition);
  const highPriority = activeSuggestions.filter(s => s.priority === 'high');
  const otherPriority = activeSuggestions.filter(s => s.priority !== 'high');

  return (
    <Card className="h-fit sticky top-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-warning" />
          ¿Qué archivos subir?
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Basado en la configuración de tu negocio, te recomendamos cargar estos datos:
        </p>
      </CardHeader>
      <CardContent className="space-y-1 pb-4">
        {highPriority.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Prioritarios</p>
            {highPriority.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                <span className="text-base mt-0.5">{s.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                </div>
              </div>
            ))}
          </>
        )}
        {otherPriority.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-3 mb-2">Opcionales</p>
            {otherPriority.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                <span className="text-base mt-0.5">{s.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                </div>
              </div>
            ))}
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
          {allDone && (
            <Button variant="ghost" size="sm" onClick={onDismiss} className="h-7 text-xs">
              Cerrar
            </Button>
          )}
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
              {item.status === 'processing' && item.currentChunk !== undefined && item.totalChunks && item.totalChunks > 1 && (
                <span className="text-muted-foreground whitespace-nowrap">Bloque {item.currentChunk + 1} de {item.totalChunks}</span>
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
function StatusDashboard({ files, totalCount }: { files: FileRecord[]; totalCount: number }) {
  // We use totalCount for "total" and compute status counts from visible + context
  const processed = files.filter(f => f.status === 'processed').length;
  const queued = files.filter(f => f.status === 'queued').length;
  const processing = files.filter(f => f.status === 'processing').length;
  const errors = files.filter(f => f.status === 'error').length;

  if (totalCount === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <div>
          <p className="text-lg font-bold text-success">{processed}</p>
          <p className="text-[10px] text-muted-foreground">Procesados</p>
        </div>
      </div>
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border border-border">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-lg font-bold">{queued}</p>
          <p className="text-[10px] text-muted-foreground">En cola</p>
        </div>
      </div>
      <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
        <Loader2 className={`h-4 w-4 text-warning ${processing > 0 ? 'animate-spin' : ''}`} />
        <div>
          <p className="text-lg font-bold text-warning">{processing}</p>
          <p className="text-[10px] text-muted-foreground">Procesando</p>
        </div>
      </div>
      <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <div>
          <p className="text-lg font-bold text-destructive">{errors}</p>
          <p className="text-[10px] text-muted-foreground">Errores</p>
        </div>
      </div>
    </div>
  );
}

export default function CargaDatos() {
  const { user, profile, role, companySettings } = useAuth();
  const { refetch: refetchExtractedData, data: globalExtractedData, mappings: globalMappings, taggedVentasRows, taggedGastosRows, taggedMarketingRows } = useExtractedData();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [extractedDataMap, setExtractedDataMap] = useState<Record<string, ExtractedData[]>>({});
  const [dragging, setDragging] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [storageUsedBytes, setStorageUsedBytes] = useState<number>(0);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevErrorIdsRef = useRef<Set<string>>(new Set());
  const [urlImportText, setUrlImportText] = useState('');
  const [isImportingUrls, setIsImportingUrls] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);

  // Overlap detection state
  const [overlapInfo, setOverlapInfo] = useState<{
    fileUploadId: string;
    fileName: string;
    overlappingMonths: string[];
    category: string;
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

  const fetchExtractedData = useCallback(async (fileIds: string[]) => {
    if (fileIds.length === 0) return;
    const { data } = await supabase
      .from('file_extracted_data')
      .select('file_upload_id, data_category, summary, row_count, chunk_index')
      .in('file_upload_id', fileIds)
      .order('chunk_index', { ascending: true });
    if (data) {
      const map: Record<string, ExtractedData[]> = {};
      data.forEach(d => {
        const key = d.file_upload_id;
        if (!map[key]) map[key] = [];
        map[key].push(d as ExtractedData);
      });
      setExtractedDataMap(prev => ({ ...prev, ...map }));
    }
  }, []);

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

      // Detect new errors and show toast
      const currentErrorIds = new Set(records.filter(f => f.status === 'error').map(f => f.id));
      for (const f of records) {
        if (f.status === 'error' && !prevErrorIdsRef.current.has(f.id)) {
          toast.error(`Error procesando "${f.file_name}"`, {
            description: f.processing_error || 'Error desconocido durante el procesamiento',
            duration: 8000,
          });
        }
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

  // Fetch storage usage
  const fetchStorageUsage = useCallback(async () => {
    if (!profile?.company_id) return;
    const { data, error } = await supabase
      .from('file_uploads')
      .select('file_size')
      .eq('company_id', profile.company_id);
    if (!error && data) {
      const total = data.reduce((sum, f) => sum + (f.file_size || 0), 0);
      setStorageUsedBytes(total);
    }
  }, [profile?.company_id]);

  useEffect(() => {
    fetchFiles();
    fetchStorageUsage();
  }, [fetchFiles, fetchStorageUsage]);

  // Polling
  useEffect(() => {
    const hasProcessing = files.some(f => f.status === 'processing' || f.status === 'queued');
    if (hasProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(() => { fetchFiles(); }, 5000);
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

  // ─── Batch Upload with Parallel Queue ──────────────────────
  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!user || !profile?.company_id) return;
    const filesToUpload = Array.from(fileList);
    if (filesToUpload.length === 0) return;

    // Validate file formats
    const SUPPORTED_EXTENSIONS = ['xlsx', 'xls', 'xlsm', 'csv', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'doc', 'docx', 'xml', 'txt'];
    const validFiles: File[] = [];
    for (const file of filesToUpload) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        toast.error(`Formato no compatible: .${ext}`, {
          description: `Formatos aceptados: Excel (.xlsx, .xls), CSV (.csv), PDF (.pdf), Imágenes (.jpg, .png, .webp, .gif, .bmp), Word (.doc, .docx) y XML (.xml).`,
          duration: 8000,
        });
        continue;
      }
      validFiles.push(file);
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
              // Check if all sheets share the same headers → concatenate
              const firstHeaders = [...sheetDataSets[0].headers].sort().join('|');
              const allSame = sheetDataSets.every(s => [...s.headers].sort().join('|') === firstHeaders);

              if (allSame) {
                // Same headers: concatenate into single dataset
                const allRows = sheetDataSets.flatMap(s => s.rows);
                if (allRows.length > 50000) allRows.length = 50000;
                parsedRows = cleanParsedRows(allRows, sheetDataSets[0].headers);
                parsedHeaders = sheetDataSets[0].headers;
                console.log(`[CargaDatos] ${sheetDataSets.length} sheets with same headers → concatenated ${parsedRows.length} rows`);
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
                      file_hash: `${fileHash}-sheet-${si}`,
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
              if (allRows.length > 50000) allRows.length = 50000;
              parsedRows = cleanParsedRows(allRows, sheetDataSets[0].headers);
              parsedHeaders = sheetDataSets[0].headers;
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
              if (fixed.rows.length > 50000) fixed.rows.length = 50000;
              parsedRows = fixed.rows;
              parsedHeaders = fixed.headers;
            }
            // Clean data: convert serial dates + filter summary rows
            if (parsedRows && parsedHeaders) {
              parsedRows = cleanParsedRows(parsedRows, parsedHeaders);
              console.log(`[CargaDatos] CSV after cleaning: ${parsedRows.length} rows`);
            }
            updateItem({ progress: 80 });
            console.log(`[CargaDatos] Client-side CSV parsed: ${parsedRows?.length ?? 0} rows`);
          } catch (parseErr) {
            console.warn('[CargaDatos] Client-side CSV parse failed, falling back to server:', parseErr);
          }
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
                    ...(bi > 0 && resolvedCategory ? { category: resolvedCategory } : {}),
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
          } catch (invokeErr: any) {
            await supabase.from('file_uploads').update({ status: 'queued', processing_error: null }).eq('id', dbData.id);
            console.warn('[CargaDatos] Row batch upload failed, queued for server retry:', invokeErr);
            updateItem({ status: 'done', progress: 100 });
            toast.info(`"${item.file.name}" re-encolado para procesar en el servidor`);
          }
        } else {
          updateItem({ status: 'done', progress: 100 });
          // Audit log for upload
          supabase.from('audit_logs').insert({
            company_id: profile!.company_id,
            user_id: user!.id,
            action: 'file_uploaded',
            resource_type: 'file_upload',
            metadata: { file_name: item.file.name, file_size: item.file.size },
          }).then(() => {});
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

    // Check for overlap after processing
    // We need to re-read the extracted data to check for overlaps
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
            const existingStockRows = (globalExtractedData?.stock || []);
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

          // Use tagged rows from context, filtering out rows from the same file to avoid self-overlap
          const existingRows = cat === 'ventas'
            ? taggedVentasRows.filter(t => t.fileUploadId !== newFileUploadId).map(t => t.row)
            : cat === 'gastos'
            ? taggedGastosRows.filter(t => t.fileUploadId !== newFileUploadId).map(t => t.row)
            : taggedMarketingRows.filter(t => t.fileUploadId !== newFileUploadId).map(t => t.row);

          const catMapping = cat === 'ventas' ? globalMappings.ventas : cat === 'gastos' ? globalMappings.gastos : globalMappings.marketing;
          const finder = (row: any, kw: string[]) => findString(row, kw, catMapping?.date);
          const overlap = detectPeriodOverlap(existingRows, newRows, FIELD_DATE, finder);

          if (overlap.length > 0) {
            setOverlapInfo({
              fileUploadId: ext.file_upload_id,
              fileName: item.file.name,
              overlappingMonths: overlap,
              category: cat,
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

  const handleDelete = async (file: FileRecord) => {
    try {
      if (file.storage_path) {
        const { data, error: r2Error } = await supabase.functions.invoke('r2-delete', {
          body: { storagePath: file.storage_path },
        });
        if (r2Error || !data?.success) console.warn('R2 delete warning:', r2Error?.message || data?.error);
      }
      await supabase.from('file_extracted_data').delete().eq('file_upload_id', file.id);
      const { error } = await supabase.from('file_uploads').delete().eq('id', file.id);
      if (error) throw error;
      // Audit log
      await supabase.from('audit_logs').insert({
        company_id: profile?.company_id,
        user_id: user?.id,
        action: 'file_deleted',
        resource_type: 'file_upload',
        resource_id: file.id,
        metadata: { file_name: file.file_name, file_size: file.file_size },
      }).then(() => {});
      toast.success('Archivo eliminado');
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
      // Audit log
      supabase.from('audit_logs').insert({
        company_id: profile.company_id,
        user_id: user?.id,
        action: 'file_reprocessed',
        resource_type: 'file_upload',
        resource_id: file.id,
        metadata: { file_name: file.file_name },
      }).then(() => {});
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
          if (allRows.length > 50000) allRows.length = 50000;
          
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
          <StatusDashboard files={files} totalCount={totalCount} />

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${dragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/50'} ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !isUploading && document.getElementById('file-input')?.click()}
          >
            {isUploading ? (
              <Loader2 className="h-10 w-10 mx-auto text-primary mb-3 animate-spin" />
            ) : (
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            )}
            <p className="font-medium">{isUploading ? 'Subiendo archivos...' : 'Arrastrá archivos acá o hacé click para seleccionar'}</p>
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
          </div>

          {/* File List */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground">
                  Historial de cargas {totalCount > 0 && `(${totalCount})`}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {loadingFiles ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map(f => {
                    const Icon = fileIcons[f.file_type || ''] || FileText;
                    const isReprocessing = reprocessingId === f.id;
                    const extractedChunks = extractedDataMap[f.id];
                    const hasChunks = extractedChunks && extractedChunks.length > 1;
                    const firstExtracted = extractedChunks?.[0];
                    const totalExtractedRows = extractedChunks?.reduce((sum, c) => sum + (c.row_count || 0), 0) || 0;

                    return (
                      <div key={f.id} className="p-3 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 text-sm">
                          <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{f.file_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {f.created_at ? formatDate(f.created_at) : '—'}
                              {f.file_size ? ` · ${f.file_size > 1024 * 1024 ? `${(f.file_size / 1024 / 1024).toFixed(1)} MB` : `${(f.file_size / 1024).toFixed(0)} KB`}` : ''}
                            </p>
                            {(f.status === 'error' || f.status === 'review' || f.status === 'processed_with_issues') && f.processing_error && f.processing_error !== RATE_LIMIT_MESSAGE && (
                              <p className={`text-xs mt-0.5 whitespace-pre-wrap break-words ${f.status === 'error' ? 'text-destructive' : 'text-warning'}`}>{f.processing_error}</p>
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
                          <div className={`mt-2 ml-8 flex items-start gap-2 text-xs text-muted-foreground rounded-md p-2 ${f.status === 'processed_with_issues' ? 'bg-warning/10 border border-warning/20' : 'bg-muted/30'}`}>
                            {f.status === 'processed_with_issues' ? (
                              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {categoryLabels[firstExtracted.data_category] || firstExtracted.data_category}
                                </span>
                                {totalExtractedRows > 0 && <span>· {totalExtractedRows} filas</span>}
                                {hasChunks && (
                                  <Badge variant="outline" className="h-5 text-[10px] gap-1">
                                    <Layers className="h-3 w-3" />
                                    {extractedChunks.length} bloques
                                  </Badge>
                                )}
                              </div>
                              {firstExtracted.summary && (
                                <p className="mt-0.5 leading-relaxed">{firstExtracted.summary}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {files.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {searchTerm || statusFilter !== 'all' || typeFilter !== 'all'
                        ? 'No hay archivos que coincidan con los filtros'
                        : 'No hay archivos cargados todavía'}
                    </p>
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
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={currentPage === 0}
                      onClick={() => setCurrentPage(p => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={currentPage >= totalPages - 1}
                      onClick={() => setCurrentPage(p => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <ContextualAssistant companySettings={companySettings} />
      </div>

      {/* Overlap detection dialog */}
      <AlertDialog open={!!overlapInfo} onOpenChange={(open) => { if (!open) setOverlapInfo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Datos duplicados detectados
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  El archivo <strong>"{overlapInfo?.fileName}"</strong> contiene datos de períodos que ya existen:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {overlapInfo?.overlappingMonths.map(p => {
                    const [y, m] = p.split('-');
                    const label = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                    return (
                      <Badge key={p} variant="outline" className="text-warning border-warning/30">
                        {label}
                      </Badge>
                    );
                  })}
                </div>
                <p className="text-muted-foreground">
                  ¿Querés reemplazar los datos de esos períodos con los del nuevo archivo, o mantener ambos?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOverlapInfo(null)}>
              Mantener ambos
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleOverlapReplace} className="bg-warning text-warning-foreground hover:bg-warning/90">
              Reemplazar
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
