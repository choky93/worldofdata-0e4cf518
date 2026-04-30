/**
 * ColumnMappingEditor (Hotfix-2 / Ola 22).
 *
 * Editor manual del mapeo columna-archivo → campo-semántico para archivos
 * que la IA no pudo clasificar automáticamente con confianza ("Pendiente
 * de revisión").
 *
 * Lucas reportó que el mensaje de error decía "asigná manualmente las
 * columnas" pero NO existía un editor — solo se podía cambiar la categoría.
 * Ahora hay un dialog que:
 *   - Muestra los campos semánticos esperados según la categoría detectada
 *   - Por cada campo, ofrece un dropdown con las columnas reales del archivo
 *   - El usuario asigna manualmente y guarda
 *   - Si el resultado cumple los criterios mínimos (amount/date/name),
 *     limpiamos el processing_error y el archivo deja de aparecer como
 *     "Pendiente de revisión"
 */

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, AlertTriangle, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  fileName: string;
  category: string;
  /** Mapping actual (puede estar incompleto). */
  currentMapping: Record<string, string>;
  onSaved: () => void;
}

interface SemanticField {
  key: string;
  label: string;
  description: string;
  /** Si está marcado como "key", al menos UNO de los key debe estar mapeado para que el archivo deje de ser "Pendiente". */
  isKey?: boolean;
}

/**
 * Campos semánticos por categoría — qué le pedimos al usuario asignar.
 * Ordenados de más importante a menos importante. Los `isKey: true` son
 * los críticos (al menos uno tiene que estar mapeado).
 */
const FIELDS_BY_CATEGORY: Record<string, SemanticField[]> = {
  ventas: [
    { key: 'date', label: 'Fecha', description: 'Cuándo se hizo cada venta', isKey: true },
    { key: 'amount', label: 'Monto / Total', description: 'Importe vendido', isKey: true },
    { key: 'name', label: 'Producto / Detalle', description: 'Qué se vendió' },
    { key: 'client', label: 'Cliente', description: 'A quién se le vendió' },
    { key: 'quantity', label: 'Cantidad', description: 'Unidades vendidas' },
    { key: 'unit_price', label: 'Precio unitario', description: 'Precio por unidad' },
    { key: 'cost', label: 'Costo', description: 'Costo del producto vendido' },
    { key: 'profit', label: 'Ganancia', description: 'Margen / utilidad' },
    { key: 'tax', label: 'Impuesto / IVA', description: 'IVA u otros impuestos' },
    { key: 'payment_method', label: 'Forma de pago', description: 'Efectivo, tarjeta, etc.' },
    { key: 'invoice_number', label: 'N° de comprobante', description: 'Número de factura/ticket' },
    { key: 'category', label: 'Categoría', description: 'Línea/rubro del producto' },
  ],
  gastos: [
    { key: 'date', label: 'Fecha', description: 'Cuándo se hizo el gasto', isKey: true },
    { key: 'amount', label: 'Monto', description: 'Importe gastado', isKey: true },
    { key: 'name', label: 'Concepto / Descripción', description: 'En qué se gastó' },
    { key: 'supplier', label: 'Proveedor', description: 'A quién se le pagó' },
    { key: 'category', label: 'Categoría', description: 'Tipo de gasto' },
    { key: 'status', label: 'Estado', description: 'Pagado / pendiente' },
    { key: 'payment_method', label: 'Forma de pago', description: 'Efectivo, transferencia, etc.' },
  ],
  marketing: [
    { key: 'campaign_name', label: 'Nombre de campaña', description: 'Cómo se llama la campaña', isKey: true },
    { key: 'spend', label: 'Gasto / Inversión', description: 'Cuánto se invirtió en publicidad', isKey: true },
    { key: 'date', label: 'Fecha', description: 'Día específico de la métrica', isKey: true },
    { key: 'start_date', label: 'Fecha inicio', description: 'Cuándo empezó la campaña/período', isKey: true },
    { key: 'end_date', label: 'Fecha fin', description: 'Cuándo terminó la campaña/período' },
    { key: 'platform', label: 'Plataforma', description: 'Meta, Google, TikTok, etc.' },
    { key: 'objective', label: 'Objetivo', description: 'Tráfico, mensajes, conversiones, etc.' },
    { key: 'clicks', label: 'Clicks', description: 'Cantidad de clics' },
    { key: 'impressions', label: 'Impresiones', description: 'Cantidad de veces que se mostró' },
    { key: 'reach', label: 'Alcance', description: 'Personas únicas alcanzadas' },
    { key: 'conversions', label: 'Conversiones', description: 'Acciones objetivo logradas' },
    { key: 'roas', label: 'ROAS', description: 'Retorno sobre inversión publicitaria' },
    { key: 'ctr', label: 'CTR', description: 'Tasa de clicks' },
    { key: 'revenue', label: 'Ingresos atribuidos', description: 'Ventas generadas por la campaña' },
  ],
  stock: [
    { key: 'name', label: 'Producto', description: 'Nombre del producto', isKey: true },
    { key: 'quantity', label: 'Stock / Cantidad', description: 'Unidades en inventario', isKey: true },
    { key: 'price', label: 'Precio de venta', description: 'A cuánto se vende' },
    { key: 'cost', label: 'Costo', description: 'Cuánto cuesta comprarlo' },
    { key: 'min_stock', label: 'Stock mínimo', description: 'Punto de reposición' },
    { key: 'sku', label: 'SKU / Código', description: 'Código del producto' },
    { key: 'category', label: 'Categoría', description: 'Tipo de producto' },
    { key: 'supplier', label: 'Proveedor', description: 'Quién lo provee' },
  ],
  facturas: [
    { key: 'date', label: 'Fecha emisión', description: 'Cuándo se emitió la factura', isKey: true },
    { key: 'amount', label: 'Monto total', description: 'Importe total con IVA', isKey: true },
    { key: 'number', label: 'Número de factura', description: 'Punto de venta + número' },
    { key: 'client', label: 'Cliente / Proveedor', description: 'Razón social' },
    { key: 'type', label: 'Tipo', description: 'A / B / C / X' },
    { key: 'net_amount', label: 'Monto neto', description: 'Sin IVA' },
    { key: 'tax', label: 'IVA', description: 'Impuesto' },
    { key: 'due_date', label: 'Vencimiento', description: 'Cuándo vence el pago' },
  ],
  clientes: [
    { key: 'name', label: 'Nombre / Razón social', description: 'Nombre del cliente', isKey: true },
    { key: 'email', label: 'Email', description: 'Correo de contacto' },
    { key: 'phone', label: 'Teléfono', description: 'Número de contacto' },
    { key: 'total_purchases', label: 'Total comprado', description: 'Acumulado histórico' },
    { key: 'debt', label: 'Deuda', description: 'Saldo pendiente' },
    { key: 'last_purchase', label: 'Última compra', description: 'Fecha de la última transacción' },
    { key: 'purchase_count', label: 'Cantidad de compras', description: 'Frecuencia de compra' },
    { key: 'category', label: 'Segmento', description: 'Tipo de cliente' },
  ],
  crm: [
    { key: 'deal_name', label: 'Nombre del deal', description: 'Cómo se llama la oportunidad', isKey: true },
    { key: 'stage', label: 'Etapa', description: 'En qué parte del pipeline está', isKey: true },
    { key: 'amount', label: 'Valor del deal', description: 'Cuánto se factura si se cierra', isKey: true },
    { key: 'close_date', label: 'Fecha cierre estim.', description: 'Cuándo se espera cerrar', isKey: true },
    { key: 'created_date', label: 'Fecha creación', description: 'Cuándo se creó el deal' },
    { key: 'owner', label: 'Owner / Vendedor', description: 'Quién lleva el deal' },
    { key: 'account', label: 'Cuenta / Empresa', description: 'Empresa cliente' },
    { key: 'probability', label: 'Probabilidad %', description: 'Chance de cierre' },
    { key: 'lead_source', label: 'Fuente / Origen', description: 'De dónde vino el lead' },
  ],
  rrhh: [
    { key: 'name', label: 'Empleado', description: 'Nombre del empleado', isKey: true },
    { key: 'salary', label: 'Sueldo', description: 'Remuneración', isKey: true },
    { key: 'date', label: 'Fecha / Período', description: 'Mes liquidado' },
    { key: 'position', label: 'Cargo', description: 'Puesto' },
    { key: 'department', label: 'Área', description: 'Departamento / sector' },
    { key: 'hours', label: 'Horas', description: 'Horas trabajadas' },
  ],
  otro: [
    { key: 'date', label: 'Fecha', description: 'Si hay alguna fecha en el archivo' },
    { key: 'amount', label: 'Monto / Valor', description: 'Si hay algún monto' },
    { key: 'name', label: 'Nombre / Descripción', description: 'Identificador principal' },
  ],
};

const NONE = '__none__';

export function ColumnMappingEditor({ open, onOpenChange, fileId, fileName, category, currentMapping, onSaved }: Props) {
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const fields = FIELDS_BY_CATEGORY[category] || FIELDS_BY_CATEGORY.otro;
  const keyFields = fields.filter(f => f.isKey);
  const optionalFields = fields.filter(f => !f.isKey);

  const hasAnyKeyMapped = keyFields.some(f => mapping[f.key] && mapping[f.key] !== NONE);

  // Cargar headers del archivo + mapping actual
  React.useEffect(() => {
    if (!open || !fileId) return;
    setLoading(true);
    (async () => {
      try {
        // Buscar el primer chunk de datos para sacar los headers reales
        const { data, error } = await supabase
          .from('file_extracted_data')
          .select('extracted_json')
          .eq('file_upload_id', fileId)
          .gte('chunk_index', 0)
          .order('chunk_index', { ascending: true })
          .limit(1);
        if (error) throw error;
        const json = data?.[0]?.extracted_json as { columns?: string[] } | undefined;
        const cols = json?.columns || [];
        setHeaders(cols);
        setMapping({ ...currentMapping });
      } catch (err) {
        const e = err as { message?: string };
        toast.error('Error cargando archivo', { description: e.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, fileId, currentMapping]);

  const handleChange = (semantic: string, value: string) => {
    setMapping(prev => {
      const next = { ...prev };
      if (value === NONE) delete next[semantic];
      else next[semantic] = value;
      return next;
    });
  };

  const handleSave = async () => {
    if (!hasAnyKeyMapped) {
      toast.error('Asigná al menos un campo clave', {
        description: `Para ${category}, necesitás mapear al menos uno de: ${keyFields.map(f => f.label).join(', ')}.`,
      });
      return;
    }
    setSaving(true);
    try {
      // 1) Actualizar el _column_mapping
      const { error: updErr } = await supabase
        .from('file_extracted_data')
        .update({
          extracted_json: { category, column_mapping: mapping } as never,
        })
        .eq('file_upload_id', fileId)
        .eq('data_category', '_column_mapping');
      if (updErr) throw updErr;

      // 2) Limpiar processing_error y poner status 'completed' si ahora tiene los keys necesarios
      const { error: fileErr } = await supabase
        .from('file_uploads')
        .update({
          processing_error: null,
          status: 'completed',
        })
        .eq('id', fileId);
      if (fileErr) throw fileErr;

      toast.success('Mapeo guardado', {
        description: 'El archivo ya no requiere revisión. Los datos se reflejarán en el dashboard.',
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const e = err as { message?: string };
      toast.error('Error al guardar', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Asignar columnas manualmente
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{fileName}</span> · Categoría: <strong>{category}</strong>
            <br />
            Para cada campo, seleccioná qué columna del archivo corresponde. Los marcados con ⭐ son los críticos
            (con asignar al menos uno alcanza para que el archivo se procese).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Cargando archivo...</span>
          </div>
        ) : headers.length === 0 ? (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">No pudimos leer las columnas del archivo</p>
              <p className="text-muted-foreground text-xs mt-1">
                Probá reprocesar el archivo primero (botón ↻). Si después del reprocesamiento sigue así,
                avisanos y revisamos el archivo manualmente.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 -mx-1 px-1">
            <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
              <strong>Columnas detectadas en el archivo</strong> ({headers.length}):{' '}
              <span className="font-mono">{headers.join(', ')}</span>
            </div>

            {/* Campos clave */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">⭐ Campos clave (al menos uno)</p>
              <div className="space-y-2">
                {keyFields.map(f => (
                  <FieldRow key={f.key} field={f} value={mapping[f.key]} headers={headers} onChange={(v) => handleChange(f.key, v)} />
                ))}
              </div>
            </div>

            {/* Campos opcionales */}
            {optionalFields.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Otros campos (opcionales)</p>
                <div className="space-y-2">
                  {optionalFields.map(f => (
                    <FieldRow key={f.key} field={f} value={mapping[f.key]} headers={headers} onChange={(v) => handleChange(f.key, v)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || headers.length === 0 || !hasAnyKeyMapped}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar mapeo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ field, value, headers, onChange }: {
  field: SemanticField;
  value: string | undefined;
  headers: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2 items-start">
      <div className="text-sm">
        <p className="font-medium flex items-center gap-1">
          {field.isKey && <span className="text-primary">⭐</span>}
          {field.label}
        </p>
        <p className="text-[11px] text-muted-foreground leading-tight">{field.description}</p>
      </div>
      <Select value={value || NONE} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="— No mapeado —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="text-xs italic text-muted-foreground">— No mapeado —</SelectItem>
          {headers.map(h => (
            <SelectItem key={h} value={h} className="text-xs font-mono">{h}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
