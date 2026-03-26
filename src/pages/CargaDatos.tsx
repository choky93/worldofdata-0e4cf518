import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Image, FileSpreadsheet, Trash2, Lightbulb, Loader2, CheckCircle2, Circle } from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

interface SuggestionItem {
  icon: string;
  title: string;
  description: string;
  condition: boolean;
  priority: 'high' | 'medium' | 'low';
}

function ContextualAssistant({ companySettings }: { companySettings: any }) {
  const suggestions: SuggestionItem[] = [
    {
      icon: '📊',
      title: 'Hoja de ventas',
      description: 'Subí tu Excel o CSV con las ventas del mes para calcular facturación, ticket promedio y tendencias.',
      condition: true, // siempre relevante
      priority: 'high',
    },
    {
      icon: '💰',
      title: 'Facturas de proveedores',
      description: 'Subí PDFs o fotos de facturas para registrar costos y calcular tu margen real.',
      condition: true,
      priority: 'high',
    },
    {
      icon: '📦',
      title: 'Lista de productos / stock',
      description: 'Subí tu inventario con cantidades, precios y costos para detectar faltantes y sobrestock.',
      condition: !companySettings || companySettings.sells_products || companySettings.has_stock,
      priority: 'high',
    },
    {
      icon: '📈',
      title: 'Reporte de Meta Ads',
      description: 'Exportá el rendimiento de campañas desde Meta Business Suite y subilo acá.',
      condition: !companySettings || companySettings.uses_meta_ads,
      priority: 'medium',
    },
    {
      icon: '🔍',
      title: 'Reporte de Google Ads',
      description: 'Descargá el informe de rendimiento desde Google Ads y subilo para analizar ROAS.',
      condition: !companySettings || companySettings.uses_google_ads,
      priority: 'medium',
    },
    {
      icon: '🚚',
      title: 'Registro de envíos',
      description: 'Si tenés un registro de despachos o logística, subilo para cruzar con ventas.',
      condition: !companySettings || companySettings.has_logistics,
      priority: 'low',
    },
    {
      icon: '🏦',
      title: 'Resumen bancario',
      description: 'Subí tu extracto bancario (CSV o PDF) para conciliar ingresos y egresos.',
      condition: true,
      priority: 'low',
    },
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
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);

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
      setFiles((data as FileRecord[]) || []);
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setLoadingFiles(false);
    }
  }, [profile?.company_id, role, user?.id]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!user || !profile?.company_id) return;
    setUploading(true);
    const filesToUpload = Array.from(fileList);

    try {
      for (const file of filesToUpload) {
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
        }).select('id').single();

        if (dbError) {
          toast.error(`Error registrando ${file.name}: ${dbError.message}`);
          continue;
        }

        // Trigger background processing - don't await
        supabase.functions.invoke('process-file', {
          body: { fileUploadId: dbData.id, companyId: profile.company_id },
        }).then(({ error: procError }) => {
          if (procError) {
            console.error(`Processing error for ${file.name}:`, procError);
          }
          // Refresh file list to show updated status
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
      const { error } = await supabase.from('file_uploads').delete().eq('id', file.id);
      if (error) throw error;
      toast.success('Archivo eliminado');
      setFiles(prev => prev.filter(f => f.id !== file.id));
    } catch (err: any) {
      toast.error('Error eliminando: ' + err.message);
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
            <p className="text-sm text-muted-foreground mt-1">PDF, CSV, XLS/XLSX, imágenes (máx. 20MB)</p>
            <input
              id="file-input"
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg"
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
                    return (
                      <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 text-sm transition-colors">
                        <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{f.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {f.created_at ? formatDate(f.created_at) : '—'}
                            {f.file_size ? ` · ${(f.file_size / 1024).toFixed(0)} KB` : ''}
                          </p>
                        </div>
                        <Badge className={`border-0 shrink-0 ${f.status === 'processed' ? 'bg-success/15 text-success' : f.status === 'error' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}>
                          {f.status === 'processed' ? 'Procesado' : f.status === 'error' ? 'Error' : 'Procesando'}
                        </Badge>
                        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => handleDelete(f)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
