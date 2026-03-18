import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Image, FileSpreadsheet, Trash2, HelpCircle } from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import { useAuth } from '@/contexts/AuthContext';

interface MockFile {
  id: string; name: string; type: string; date: string; status: 'processing' | 'processed' | 'error'; uploadedBy: string;
}

const mockFiles: MockFile[] = [
  { id: '1', name: 'ventas_marzo_2026.xlsx', type: 'XLS', date: '2026-03-15', status: 'processed', uploadedBy: 'Roberto García' },
  { id: '2', name: 'factura_proveedor.pdf', type: 'PDF', date: '2026-03-14', status: 'processed', uploadedBy: 'María López' },
  { id: '3', name: 'stock_actualizado.csv', type: 'CSV', date: '2026-03-12', status: 'processed', uploadedBy: 'Roberto García' },
  { id: '4', name: 'reporte_meta_ads.png', type: 'Imagen', date: '2026-03-10', status: 'processing', uploadedBy: 'María López' },
];

const fileIcons: Record<string, typeof FileText> = { PDF: FileText, CSV: FileSpreadsheet, XLS: FileSpreadsheet, Imagen: Image };

export default function CargaDatos() {
  const { role } = useAuth();
  const [files, setFiles] = useState(mockFiles);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    const newFiles: MockFile[] = droppedFiles.map((f, i) => ({
      id: `new-${Date.now()}-${i}`, name: f.name,
      type: f.name.endsWith('.pdf') ? 'PDF' : f.name.endsWith('.csv') ? 'CSV' : f.name.endsWith('.xlsx') || f.name.endsWith('.xls') ? 'XLS' : 'Imagen',
      date: new Date().toISOString().split('T')[0], status: 'processing' as const, uploadedBy: 'Vos',
    }));
    setFiles(prev => [...newFiles, ...prev]);
  }, []);

  const displayFiles = role === 'employee' ? files.filter(f => f.uploadedBy === 'Vos') : files;

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Carga de Datos</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Arrastrá archivos acá o hacé click para seleccionar</p>
            <p className="text-sm text-muted-foreground mt-1">PDF, CSV, XLS/XLSX, imágenes</p>
            <input id="file-input" type="file" className="hidden" multiple accept=".pdf,.csv,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(e) => {
              if (e.target.files) {
                const ev = { preventDefault: () => {}, dataTransfer: { files: e.target.files } } as any;
                handleDrop(ev);
              }
            }} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Historial de cargas</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {displayFiles.map(f => {
                  const Icon = fileIcons[f.type] || FileText;
                  return (
                    <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 text-sm">
                      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(f.date)} · {f.uploadedBy}</p>
                      </div>
                      <Badge className={`border-0 shrink-0 ${f.status === 'processed' ? 'bg-success/15 text-success' : f.status === 'error' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}>
                        {f.status === 'processed' ? 'Procesado' : f.status === 'error' ? 'Error' : 'Procesando'}
                      </Badge>
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => setFiles(prev => prev.filter(x => x.id !== f.id))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                {displayFiles.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No hay archivos cargados</p>}
              </div>
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
