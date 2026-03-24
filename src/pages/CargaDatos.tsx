import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Image, FileSpreadsheet, Trash2, HelpCircle, Loader2 } from 'lucide-react';
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
  uploader_name?: string;
}

const fileIcons: Record<string, typeof FileText> = { PDF: FileText, CSV: FileSpreadsheet, XLS: FileSpreadsheet, Imagen: Image };

function detectFileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'csv') return 'CSV';
  if (['xls', 'xlsx'].includes(ext)) return 'XLS';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'Imagen';
  return 'Otro';
}

export default function CargaDatos() {
  const { user, profile, role } = useAuth();
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
        const storagePath = `${user.id}/${Date.now()}_${file.name}`;

        // Upload to storage
        const { error: storageError } = await supabase.storage
          .from('uploads')
          .upload(storagePath, file);

        if (storageError) {
          toast.error(`Error subiendo ${file.name}: ${storageError.message}`);
          continue;
        }

        // Register in file_uploads table
        const { error: dbError } = await supabase.from('file_uploads').insert({
          file_name: file.name,
          file_type: detectFileType(file.name),
          file_size: file.size,
          status: 'processing',
          storage_path: storagePath,
          uploaded_by: user.id,
          company_id: profile.company_id,
        });

        if (dbError) {
          toast.error(`Error registrando ${file.name}: ${dbError.message}`);
          continue;
        }
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
  }, [user, profile?.company_id]);

  const handleDelete = async (file: FileRecord) => {
    try {
      if (file.storage_path) {
        await supabase.storage.from('uploads').remove([file.storage_path]);
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
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'} ${uploading ? 'pointer-events-none opacity-60' : ''}`}
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
                      <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 text-sm">
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
                  {files.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No hay archivos cargados</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-1"><HelpCircle className="h-4 w-4" /> Asistente de carga</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>📊 <strong>Ventas:</strong> Subí tu hoja de ventas del mes para calcular tu facturación.</p>
            <p>📦 <strong>Stock:</strong> Si tenés una lista de productos con precios, subila para armar tu inventario.</p>
            <p>💰 <strong>Gastos:</strong> Subí facturas de proveedores o un resumen de gastos.</p>
            <p>📈 <strong>Ads:</strong> Exportá tus reportes de Meta o Google Ads y subílos acá.</p>
            <p className="text-xs border-t pt-3">Formatos aceptados: PDF, CSV, XLS/XLSX, imágenes (capturas de informes)</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
