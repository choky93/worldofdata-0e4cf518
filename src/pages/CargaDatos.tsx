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
}

interface ExtractedData {
  file_upload_id: string;
  data_category: string;
  summary: string | null;
  row_count: number | null;
  chunk_index: number;
}

interface UploadQueueItem {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
}

const fileIcons: Record<string, typeof FileText> = { PDF: FileText, CSV: FileSpreadsheet, XLS: FileSpreadsheet, Imagen: Image };

const PAGE_SIZE = 25;
const MAX_CONCURRENT_UPLOADS = 4;
const PRESIGN_THRESHOLD = 20 * 1024 * 1024; // 20MB
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

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

function parseExcelToJson(file: File): Promise<string>;
function parseExcelToJson(buffer: ArrayBuffer): string;
function parseExcelToJson(input: File | ArrayBuffer): Promise<string> | string {
  if (input instanceof ArrayBuffer) {
    return doParseExcel(new Uint8Array(input));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(doParseExcel(new Uint8Array(e.target?.result as ArrayBuffer)));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsArrayBuffer(input);
  });
}

function doParseExcel(data: Uint8Array): string {
  const wb = XLSX.read(data, { type: 'array' });
  const result: { sheetName: string; rows: Record<string, unknown>[] }[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }) as Record<string, unknown>[];
    if (rows.length > 0) result.push({ sheetName: name, rows: rows.slice(0, 2000) });
  }
  const content = result.map(s =>
    `Hoja "${s.sheetName}" (${s.rows.length} filas):\n${JSON.stringify(s.rows)}`
  ).join('\n\n');
  return content;
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
          Formatos: PDF, CSV, XLS/XLSX, imágenes (capturas de reportes). Máx. 100MB por archivo. Podés subir muchos archivos a la vez.
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
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [extractedDataMap, setExtractedDataMap] = useState<Record<string, ExtractedData[]>>({});
  const [dragging, setDragging] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

      const processedIds = records.filter(f => f.status === 'processed').map(f => f.id);
      if (processedIds.length > 0) fetchExtractedData(processedIds);
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setLoadingFiles(false);
    }
  }, [profile?.company_id, role, user?.id, fetchExtractedData, currentPage, searchTerm, statusFilter, typeFilter]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

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

  const downloadFileFromR2 = async (fileUploadId: string): Promise<ArrayBuffer | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('r2-download', {
        body: { fileUploadId },
      });
      if (error) throw error;
      if (data instanceof Blob) return await data.arrayBuffer();
      return null;
    } catch (err) {
      console.error('Download from R2 failed:', err);
      return null;
    }
  };

  // ─── Upload with presigned URL for large files ────────────
  const uploadFileToStorage = async (file: File, userId: string): Promise<{ storagePath: string }> => {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(0)}MB). Máximo: 100MB.`);
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

    const queueItems: UploadQueueItem[] = filesToUpload.map((file, i) => ({
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

        let preParsedData: string | null = null;
        const ext = item.file.name.split('.').pop()?.toLowerCase() || '';
        if (['xls', 'xlsx'].includes(ext)) {
          try { preParsedData = await parseExcelToJson(item.file); } catch { /* ignore */ }
        }

        updateItem({ progress: 50 });

        const { storagePath } = await uploadFileToStorage(item.file, user.id);

        updateItem({ progress: 70 });

        const { data: dbData, error: dbError } = await supabase.from('file_uploads').insert({
          file_name: item.file.name,
          file_type: detectFileType(item.file.name),
          file_size: item.file.size,
          status: 'queued',
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

        updateItem({ progress: 85, status: 'processing' });

        supabase.functions.invoke('process-file', {
          body: {
            fileUploadId: dbData.id,
            companyId: profile.company_id,
            ...(preParsedData ? { preParsedData } : {}),
          },
        }).then(() => {
          updateItem({ status: 'done', progress: 100 });
          fetchFiles();
        }).catch(() => {
          updateItem({ status: 'done', progress: 100 });
          fetchFiles();
        });

        updateItem({ status: 'done', progress: 100 });
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
      await supabase.from('file_extracted_data').delete().eq('file_upload_id', file.id);
      await supabase.from('file_uploads').update({ status: 'processing', processing_error: null }).eq('id', file.id);

      let preParsedData: string | null = null;
      const ext = file.file_name.split('.').pop()?.toLowerCase() || '';
      if (['xls', 'xlsx'].includes(ext)) {
        try {
          const buffer = await downloadFileFromR2(file.id);
          if (buffer) {
            preParsedData = parseExcelToJson(buffer);
          } else {
            toast.error(`No se pudo descargar "${file.file_name}"`);
            setReprocessingId(null);
            return;
          }
        } catch {
          toast.error(`Error parseando "${file.file_name}"`);
          setReprocessingId(null);
          return;
        }
      }

      const { error } = await supabase.functions.invoke('process-file', {
        body: {
          fileUploadId: file.id,
          companyId: profile.company_id,
          ...(preParsedData ? { preParsedData } : {}),
        },
      });

      if (error) toast.error(`Error reprocesando: ${error.message}`);
      else toast.success(`"${file.file_name}" enviado a reprocesar`);
      await fetchFiles();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setReprocessingId(null);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const isUploading = uploadQueue.some(i => i.status === 'pending' || i.status === 'uploading' || i.status === 'processing');

  const statusLabel = (status: string | null) => {
    switch (status) {
      case 'processed': return 'Procesado';
      case 'error': return 'Error';
      case 'queued': return 'En cola';
      case 'processing': return 'Procesando';
      case 'cancelled': return 'Cancelado';
      default: return status || 'Desconocido';
    }
  };

  const statusColor = (status: string | null) => {
    switch (status) {
      case 'processed': return 'bg-success/15 text-success';
      case 'error': return 'bg-destructive/15 text-destructive';
      case 'queued': return 'bg-muted text-muted-foreground';
      case 'cancelled': return 'bg-muted text-muted-foreground';
      default: return 'bg-warning/15 text-warning';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Carga de Datos</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
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
            <p className="text-sm text-muted-foreground mt-1">PDF, CSV, Excel, Word, imágenes, XML (máx. 100MB). Podés seleccionar muchos a la vez.</p>
            <input
              id="file-input"
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.doc,.docx,.xml,.txt"
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
                            {f.status === 'error' && f.processing_error && (
                              <p className="text-xs text-destructive mt-0.5 truncate">{f.processing_error}</p>
                            )}
                          </div>
                          <Badge className={`border-0 shrink-0 ${statusColor(f.status)}`}>
                            {statusLabel(f.status)}
                          </Badge>
                          {(f.status === 'queued') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleCancel(f)}
                              title="Cancelar"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {(f.status === 'error' || f.status === 'processed' || f.status === 'cancelled') && (
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
                          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => handleDelete(f)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {firstExtracted && f.status === 'processed' && (
                          <div className="mt-2 ml-8 flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md p-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
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
    </div>
  );
}
