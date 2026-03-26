import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Image, FileSpreadsheet, Trash2, Lightbulb, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
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
}

const fileIcons: Record<string, typeof FileText> = { PDF: FileText, CSV: FileSpreadsheet, XLS: FileSpreadsheet, Imagen: Image };

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
    if (rows.length > 0) result.push({ sheetName: name, rows: rows.slice(0, 50) });
  }
  const content = result.map(s =>
    `Hoja "${s.sheetName}" (${s.rows.length} filas):\n${JSON.stringify(s.rows)}`
  ).join('\n\n');
  return content.substring(0, 8000);
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
          Formatos: PDF, CSV, XLS/XLSX, imágenes (capturas de reportes). Máx. 20MB por archivo.
        </p>
      </CardContent>
    </Card>
  );
}

export default function CargaDatos() {
  const { user, profile, role, companySettings } = useAuth();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [extractedDataMap, setExtractedDataMap] = useState<Record<string, ExtractedData>>({});
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchExtractedData = useCallback(async (fileIds: string[]) => {
    if (fileIds.length === 0) return;
    const { data } = await supabase
      .from('file_extracted_data')
      .select('file_upload_id, data_category, summary, row_count')
      .in('file_upload_id', fileIds);
    if (data) {
      const map: Record<string, ExtractedData> = {};
      data.forEach(d => { map[d.file_upload_id] = d as ExtractedData; });
      setExtractedDataMap(prev => ({ ...prev, ...map }));
    }
  }, []);

  const fetchFiles = useCallback(async () => {
    if (!profile?.company_id) return;
    try {
      let query = supabase
        .from('file_uploads')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      if (role === 'employee') {
        query = query.eq('uploaded_by', user?.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      const records = (data as FileRecord[]) || [];
      setFiles(records);

      // Fetch extracted data for processed files
      const processedIds = records.filter(f => f.status === 'processed').map(f => f.id);
      if (processedIds.length > 0) fetchExtractedData(processedIds);
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setLoadingFiles(false);
    }
  }, [profile?.company_id, role, user?.id, fetchExtractedData]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Polling: auto-refresh when files are processing
  useEffect(() => {
    const hasProcessing = files.some(f => f.status === 'processing');
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

  /** Download file from R2 via r2-upload function (GET-like) for reprocessing */
  const downloadFileFromR2 = async (storagePath: string): Promise<ArrayBuffer | null> => {
    try {
      // Use the r2-upload function to get a signed URL or direct download
      // For now, we'll call process-file directly and let the server handle it
      return null;
    } catch {
      return null;
    }
  };

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!user || !profile?.company_id) return;
    setUploading(true);
    const filesToUpload = Array.from(fileList);

    try {
      for (const file of filesToUpload) {
        const fileHash = await computeFileHash(file);

        const { data: existing } = await supabase
          .from('file_uploads')
          .select('id, file_name')
          .eq('company_id', profile.company_id)
          .eq('file_hash', fileHash)
          .limit(1);

        if (existing && existing.length > 0) {
          toast.warning(`"${file.name}" ya fue cargado anteriormente (coincide con "${existing[0].file_name}"). Se omitió.`);
          continue;
        }

        let preParsedData: string | null = null;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (['xls', 'xlsx'].includes(ext)) {
          try {
            preParsedData = await parseExcelToJson(file);
          } catch (parseErr) {
            console.warn('Client-side Excel parse failed:', parseErr);
          }
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('userId', user.id);

        const { data: uploadData, error: uploadError } = await supabase.functions.invoke('r2-upload', {
          body: formData,
        });

        if (uploadError || !uploadData?.success) {
          toast.error(`Error subiendo ${file.name}: ${uploadError?.message || uploadData?.error || 'Error desconocido'}`);
          continue;
        }

        const { data: dbData, error: dbError } = await supabase.from('file_uploads').insert({
          file_name: file.name,
          file_type: detectFileType(file.name),
          file_size: file.size,
          status: 'processing',
          storage_path: uploadData.storagePath,
          uploaded_by: user.id,
          company_id: profile.company_id,
          file_hash: fileHash,
        }).select('id').single();

        if (dbError) {
          toast.error(`Error registrando ${file.name}: ${dbError.message}`);
          continue;
        }

        supabase.functions.invoke('process-file', {
          body: {
            fileUploadId: dbData.id,
            companyId: profile.company_id,
            ...(preParsedData ? { preParsedData } : {}),
          },
        }).then(({ error: procError }) => {
          if (procError) console.error(`Processing error for ${file.name}:`, procError);
          fetchFiles();
        });
      }

      toast.success(`${filesToUpload.length} archivo(s) subido(s) correctamente`);
      await fetchFiles();
    } catch (err: any) {
      toast.error('Error en la carga: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.company_id]);

  const handleDelete = async (file: FileRecord) => {
    try {
      if (file.storage_path) {
        const { data, error: r2Error } = await supabase.functions.invoke('r2-delete', {
          body: { storagePath: file.storage_path },
        });
        if (r2Error || !data?.success) {
          console.warn('R2 delete warning:', r2Error?.message || data?.error);
        }
      }
      await supabase.from('file_extracted_data').delete().eq('file_upload_id', file.id);
      const { error } = await supabase.from('file_uploads').delete().eq('id', file.id);
      if (error) throw error;
      toast.success('Archivo eliminado');
      setFiles(prev => prev.filter(f => f.id !== file.id));
      setExtractedDataMap(prev => {
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
    } catch (err: any) {
      toast.error('Error eliminando: ' + err.message);
    }
  };

  const handleReprocess = async (file: FileRecord) => {
    if (!profile?.company_id) return;
    setReprocessingId(file.id);
    try {
      await supabase.from('file_extracted_data').delete().eq('file_upload_id', file.id);
      await supabase.from('file_uploads').update({ status: 'processing', processing_error: null }).eq('id', file.id);

      // For Excel files, try to download and pre-parse on client
      let preParsedData: string | null = null;
      const ext = file.file_name.split('.').pop()?.toLowerCase() || '';
      if (['xls', 'xlsx'].includes(ext) && file.storage_path) {
        try {
          // Download file via a fetch to r2-upload with GET-like semantics
          // Since we can't easily download from R2 on the client, we let the server handle it
          // The server will use the filename-based fallback for Excel, which GPT-4o handles well
        } catch (e) {
          console.warn('Could not pre-parse Excel for reprocess:', e);
        }
      }

      const { error } = await supabase.functions.invoke('process-file', {
        body: {
          fileUploadId: file.id,
          companyId: profile.company_id,
          ...(preParsedData ? { preParsedData } : {}),
        },
      });

      if (error) {
        toast.error(`Error reprocesando: ${error.message}`);
      } else {
        toast.success(`"${file.file_name}" enviado a reprocesar`);
      }
      await fetchFiles();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setReprocessingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Carga de Datos</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${dragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/50'} ${uploading ? 'pointer-events-none opacity-60' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && document.getElementById('file-input')?.click()}
          >
            {uploading ? (
              <Loader2 className="h-10 w-10 mx-auto text-primary mb-3 animate-spin" />
            ) : (
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            )}
            <p className="font-medium">{uploading ? 'Subiendo archivos...' : 'Arrastrá archivos acá o hacé click para seleccionar'}</p>
            <p className="text-sm text-muted-foreground mt-1">PDF, CSV, Excel, Word, imágenes, XML (máx. 20MB)</p>
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

          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Historial de cargas</CardTitle></CardHeader>
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
                    const extracted = extractedDataMap[f.id];
                    return (
                      <div key={f.id} className="p-3 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 text-sm">
                          <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{f.file_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {f.created_at ? formatDate(f.created_at) : '—'}
                              {f.file_size ? ` · ${(f.file_size / 1024).toFixed(0)} KB` : ''}
                            </p>
                            {f.status === 'error' && f.processing_error && (
                              <p className="text-xs text-destructive mt-0.5 truncate">{f.processing_error}</p>
                            )}
                          </div>
                          <Badge className={`border-0 shrink-0 ${f.status === 'processed' ? 'bg-success/15 text-success' : f.status === 'error' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}>
                            {f.status === 'processed' ? 'Procesado' : f.status === 'error' ? 'Error' : 'Procesando'}
                          </Badge>
                          {(f.status === 'error' || f.status === 'processed') && (
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
                        {/* Extracted data summary */}
                        {extracted && f.status === 'processed' && (
                          <div className="mt-2 ml-8 flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md p-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                            <div>
                              <span className="font-medium text-foreground">
                                {categoryLabels[extracted.data_category] || extracted.data_category}
                              </span>
                              {extracted.row_count ? ` · ${extracted.row_count} filas` : ''}
                              {extracted.summary && (
                                <p className="mt-0.5 leading-relaxed">{extracted.summary}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {files.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No hay archivos cargados todavía</p>}
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
