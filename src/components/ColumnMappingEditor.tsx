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
    // Plataforma se REMOVIÓ de los campos a mapear (Lucas: "no es una columna,
    // no la voy a encontrar nunca"). Ahora se detecta del nombre del archivo
    // (Meta export, Google_Ads_Campaign, etc.) o se asume el valor por defecto.
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
    // Hotfix-3: marcamos los 3 como isKey para que con uno alcance.
    // Caso "otro" se usa como fallback cuando la categoría real no se puede
    // determinar — no queremos que el usuario quede bloqueado sin nada que cumplir.
    { key: 'date', label: 'Fecha', description: 'Si hay alguna fecha en el archivo', isKey: true },
    { key: 'amount', label: 'Monto / Valor', description: 'Si hay algún monto', isKey: true },
    { key: 'name', label: 'Nombre / Descripción', description: 'Identificador principal', isKey: true },
  ],
};

const NONE = '__none__';

/**
 * Detecta el campo semántico de un header del archivo basándose en keywords
 * comunes en español/inglés. Cubre exports típicos de Meta Ads, Google Ads,
 * Pipedrive, HubSpot, Salesforce, sistemas argentinos (Tango, Bejerman, etc).
 *
 * Devuelve el `key` semántico (ej. 'spend', 'campaign_name') o null si no
 * matchea. Usado como fallback cuando el extractor IA no detectó mappings.
 */
function detectSemanticFromHeader(header: string): string | null {
  if (!header) return null;
  const h = header.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  // ── Marketing (Meta Ads, Google Ads) ──────────────────────
  if (/^(nombre.*campa[ñn]a|campaign.?name|campa[ñn]a$)/.test(h)) return 'campaign_name';
  if (/(importe.*gastado|gasto.*publicit|spend|amount.spent|cost\b)/.test(h)) return 'spend';
  if (/(inicio.*informe|reporting.starts|fecha.*inicio|start.date|desde)/.test(h)) return 'start_date';
  if (/(fin.*informe|reporting.ends|fecha.*fin|end.date|hasta)/.test(h)) return 'end_date';
  // FIX audit Tanda 8 H2: 'platform' fue removido de FIELDS_BY_CATEGORY.marketing
  // (la plataforma se infiere del nombre del archivo, no es columna mapeable).
  // Antes esta regla creaba un mapping fantasma {platform: 'Plataforma'} que
  // el editor nunca renderizaba como campo, generando confusión en backend.
  if (/^(objetivo|objective|tipo.*campa[ñn]a|campaign.objective|indicador.*resultado)$/.test(h)) return 'objective';
  if (/^(impresiones|impressions|impr\.?)/.test(h)) return 'impressions';
  if (/^(alcance|reach|personas.*alcanzadas)/.test(h)) return 'reach';
  if (/^(clicks?|clics?|clic.*enlace)/.test(h)) return 'clicks';
  if (/(conversion|compras|purchases|leads.*generados)/.test(h)) return 'conversions';
  if (/^(roas|retorno.*publicidad|roas.*resultados)/.test(h)) return 'roas';
  if (/^(ctr|tasa.*clicks?)/.test(h)) return 'ctr';
  if (/(ingresos.*atribuidos|valor.*conversion|revenue|purchase.value)/.test(h)) return 'revenue';

  // ── Ventas / facturas / gastos generales ───────────────────
  // FIX audit Tanda 8 H3: cobertura para AFIP/Mis Comprobantes y Mercado Pago.
  // AFIP usa "Imp. Total", "Imp. Neto Gravado" con punto+espacio que rompía
  // el regex anclado de abajo. MP usa "Dinero recibido (ARS)", "Monto cobrado".
  if (/^(imp\.?\s*(total|neto|gravado|liquidado)|tipo.*comprobante)/.test(h)) return 'amount';
  if (/(dinero.*recibido|dinero.*cobrado|monto.*cobrado|monto.*neto)/.test(h)) return 'amount';
  if (/^(monto|total|importe|amount|valor|precio.venta|precio.de.venta)/.test(h)) return 'amount';
  if (/^(fecha|date|periodo|mes|month|day|dia)/.test(h)) return 'date';
  if (/^(cliente|client|comprador|customer|raz[oó]n.social|empresa)/.test(h)) return 'client';
  if (/^(producto|product|articulo|item|sku|descripci[oó]n|detalle|concepto|nombre)/.test(h)) return 'name';
  if (/^(cantidad|qty|unidades|cant\.?)/.test(h)) return 'quantity';
  if (/^(costo|cost|precio.costo|cogs)/.test(h)) return 'cost';
  if (/^(ganancia|profit|margen|margin)/.test(h)) return 'profit';
  if (/^(iva|impuesto|tax)/.test(h)) return 'tax';
  if (/(forma.*pago|m[eé]todo.*pago|payment.method|pago)/.test(h)) return 'payment_method';
  if (/(numero.*factura|nro.*factura|n[°º].*factura|factura.*nro|invoice.number)/.test(h)) return 'invoice_number';

  // ── Stock ──────────────────────────────────────────────────
  if (/^(stock|existencia|disponible)/.test(h)) return 'quantity';
  if (/(stock.*minimo|min.*stock|punto.*reposicion)/.test(h)) return 'min_stock';
  if (/^(proveedor|supplier|vendor)/.test(h)) return 'supplier';

  // ── CRM ────────────────────────────────────────────────────
  if (/^(deal.name|opportunity.name|nombre.*oportunidad|titulo.*deal)/.test(h)) return 'deal_name';
  if (/^(stage|etapa|pipeline.stage|deal.stage|fase|status)/.test(h)) return 'stage';
  if (/(close.date|fecha.*cierre|expected.close|closing.date)/.test(h)) return 'close_date';
  if (/(created.date|fecha.*creacion|date.created)/.test(h)) return 'created_date';
  if (/^(owner|deal.owner|vendedor|sales.rep|asignado)/.test(h)) return 'owner';
  if (/^(account|account.name|cuenta|company.name)/.test(h)) return 'account';
  // FIX audit Tanda 8 H3: Pipedrive en español usa "Persona de contacto" y
  // "Organización" como columnas estándar de leads/oportunidades.
  if (/^(persona.*contacto|contacto)/.test(h)) return 'client';
  if (/^(organizaci[oó]n|empresa.*deal)/.test(h)) return 'account';
  if (/(probability|probabilidad|win.probability)/.test(h)) return 'probability';
  if (/(lead.source|source|origen|fuente|canal|channel)/.test(h)) return 'lead_source';

  // ── Clientes ───────────────────────────────────────────────
  if (/(total.*compras|total.*comprado|lifetime.value)/.test(h)) return 'total_purchases';
  if (/(deuda|saldo.*pendiente|debt|amount.due|balance)/.test(h)) return 'debt';
  if (/(ultima.*compra|last.*purchase|fecha.*ultima)/.test(h)) return 'last_purchase';
  if (/(cantidad.*compras|num.*compras|purchase.count|frecuencia)/.test(h)) return 'purchase_count';
  if (/^(email|correo|mail)/.test(h)) return 'email';
  if (/^(tel[eé]fono|phone|tel\.?|celular|movil)/.test(h)) return 'phone';

  // ── RRHH ───────────────────────────────────────────────────
  if (/^(sueldo|salario|salary|haber|remuneracion)/.test(h)) return 'salary';
  if (/(cargo|puesto|position|rol)/.test(h)) return 'position';
  if (/^(area|departamento|department|sector)/.test(h)) return 'department';
  if (/^(horas|hours|hs\.?)/.test(h)) return 'hours';

  return null;
}

export function ColumnMappingEditor({ open, onOpenChange, fileId, fileName, category, currentMapping, onSaved }: Props) {
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  // Hotfix-3: la categoría que llega por prop puede ser "_column_mapping"
  // (cuando el caller lee data_category del primer chunk meta). Acá leemos
  // la categoría REAL desde extracted_json.category del row _column_mapping.
  const [resolvedCategory, setResolvedCategory] = React.useState<string>(category);

  const effectiveCategory = FIELDS_BY_CATEGORY[resolvedCategory] ? resolvedCategory : 'otro';
  const fields = FIELDS_BY_CATEGORY[effectiveCategory];
  const keyFields = fields.filter(f => f.isKey);
  const optionalFields = fields.filter(f => !f.isKey);

  const hasAnyKeyMapped = keyFields.some(f => mapping[f.key] && mapping[f.key] !== NONE);

  // Cargar headers del archivo + mapping actual + resolver la categoría real
  React.useEffect(() => {
    if (!open || !fileId) return;
    setLoading(true);
    (async () => {
      try {
        // Pedimos en paralelo: (1) headers de cualquier chunk de datos,
        // (2) extracted_json del row _column_mapping para sacar la categoría real.
        const [dataRes, mapRes] = await Promise.all([
          supabase
            .from('file_extracted_data')
            .select('extracted_json')
            .eq('file_upload_id', fileId)
            .gte('chunk_index', 0)
            .order('chunk_index', { ascending: true })
            .limit(1),
          supabase
            .from('file_extracted_data')
            .select('extracted_json')
            .eq('file_upload_id', fileId)
            .eq('data_category', '_column_mapping')
            .limit(1),
        ]);
        if (dataRes.error) throw dataRes.error;
        if (mapRes.error) throw mapRes.error;

        // Headers — del primer chunk de datos
        const dataJson = dataRes.data?.[0]?.extracted_json as { columns?: string[] } | undefined;
        const cols = dataJson?.columns || [];
        setHeaders(cols);

        // Categoría real — del extracted_json del _column_mapping row
        const mapJson = mapRes.data?.[0]?.extracted_json as { category?: string } | undefined;
        const realCat = mapJson?.category;
        if (realCat && FIELDS_BY_CATEGORY[realCat]) {
          setResolvedCategory(realCat);
        } else if (FIELDS_BY_CATEGORY[category]) {
          setResolvedCategory(category);
        } else {
          setResolvedCategory('otro');
        }

        // FIX feedback Lucas (2026-05-03): si el extractor IA no detectó
        // mappings (currentMapping vacío), aplicamos detección heurística
        // client-side para pre-llenar campos comunes de Meta/Google/Pipedrive.
        // Antes el editor abría TODOS los campos en "No mapeado" obligando
        // al usuario a mapear celda por celda → "Calidad sigue 35%, no
        // mejora aunque mapee".
        const initialMapping = { ...currentMapping };
        if (Object.keys(initialMapping).length === 0 && cols.length > 0) {
          for (const header of cols) {
            const detected = detectSemanticFromHeader(header);
            if (detected && !initialMapping[detected]) {
              initialMapping[detected] = header;
            }
          }
        }
        setMapping(initialMapping);
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
      // 1) Actualizar el _column_mapping con la categoría REAL resolvida
      const { error: updErr } = await supabase
        .from('file_extracted_data')
        .update({
          extracted_json: { category: effectiveCategory, column_mapping: mapping } as never,
        })
        .eq('file_upload_id', fileId)
        .eq('data_category', '_column_mapping');
      if (updErr) throw updErr;

      // 2) FIX feedback Lucas (2026-05-01): "asigné todo, le di guardar pero
      //    no cambió nada". Causa: solo actualizábamos el _column_mapping
      //    pero los CHUNKS DE DATOS reales seguían con la data_category vieja
      //    (ej. 'otro') → useExtractedData los leía desde el bucket equivocado
      //    y /marketing seguía vacío.
      //    Replicamos el patrón de handleReclassify (CargaDatos.tsx:1770):
      //    actualizar data_category de TODOS los chunks de datos del file
      //    (excluyendo meta-chunks que tienen prefijo _).
      const { error: chunksErr } = await supabase
        .from('file_extracted_data')
        .update({ data_category: effectiveCategory })
        .eq('file_upload_id', fileId)
        .not('data_category', 'in', '("_raw_cache","_classification","_column_mapping")');
      if (chunksErr) throw chunksErr;

      // 3) Limpiar processing_error y marcar el archivo como procesado.
      //    AUDIT FIX: antes usábamos status='completed' que NO existe en el
      //    resto del sistema (los filtros buscan 'processed'/'review'/etc).
      //    Eso hacía desaparecer el archivo de la UI tras guardar el mapeo
      //    porque ningún tile/filtro lo reconocía.
      const { error: fileErr } = await supabase
        .from('file_uploads')
        .update({
          processing_error: null,
          status: 'processed',
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
            <span className="font-mono text-xs">{fileName}</span> · Categoría: <strong>{effectiveCategory}</strong>
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
