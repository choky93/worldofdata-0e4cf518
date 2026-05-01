/**
 * AddToOrderDialog (Ola 23).
 *
 * Dialog que se abre desde una tarjeta de alerta de Stock al clickear
 * "Agregar a pedido". Permite:
 *   - Elegir el proveedor (pre-seleccionado si el producto ya tiene uno).
 *   - Elegir la cantidad (sugerida según cobertura objetivo: 30/60/90 días).
 *   - Agregar nota opcional.
 *
 * El item se persiste en localStorage vía purchase-orders.ts.
 */

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart, Truck, AlertTriangle } from 'lucide-react';
import { addOrderItem } from '@/lib/purchase-orders';
import type { Supplier } from '@/hooks/useSuppliers';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  /** Stock actual del producto. */
  currentStock: number;
  /** Promedio mensual de venta. */
  avgMonthlyUnits: number;
  /** Cobertura actual en días. */
  coverageDays: number;
  /** Lead time efectivo del proveedor en días. */
  supplierLeadDays: number;
  /** Costo unitario del producto. */
  unitCost: number;
  /** Proveedor pre-asignado al producto (si existe). */
  preAssignedSupplierId?: string | null;
  preAssignedSupplierName?: string | null;
  /** Lista de proveedores disponibles (para cuando el producto no tiene asignado). */
  suppliers: Supplier[];
}

const COVERAGE_PRESETS = [
  { days: 30, label: '30 días' },
  { days: 60, label: '60 días' },
  { days: 90, label: '90 días' },
];

export function AddToOrderDialog({
  open,
  onOpenChange,
  productName,
  currentStock,
  avgMonthlyUnits,
  coverageDays,
  supplierLeadDays,
  unitCost,
  preAssignedSupplierId,
  preAssignedSupplierName,
  suppliers,
}: Props) {
  const [supplierId, setSupplierId] = React.useState<string>(preAssignedSupplierId || '');
  const [quantity, setQuantity] = React.useState<number>(0);
  const [notes, setNotes] = React.useState<string>('');
  const [coverageTarget, setCoverageTarget] = React.useState<number>(60);

  // Cantidad sugerida = cubrir (coverageTarget + lead time) días − stock actual.
  // Lo recalculamos cada vez que cambia el target.
  React.useEffect(() => {
    if (!open) return;
    if (avgMonthlyUnits > 0) {
      const targetUnits = (avgMonthlyUnits * (coverageTarget + supplierLeadDays)) / 30;
      setQuantity(Math.max(0, Math.ceil(targetUnits - currentStock)));
    } else {
      setQuantity(0);
    }
  }, [open, coverageTarget, avgMonthlyUnits, supplierLeadDays, currentStock]);

  // Reset al abrir
  React.useEffect(() => {
    if (open) {
      setSupplierId(preAssignedSupplierId || '');
      setNotes('');
      setCoverageTarget(60);
    }
  }, [open, preAssignedSupplierId]);

  const selectedSupplier = suppliers.find(s => s.id === supplierId);
  const totalCost = quantity * (unitCost || 0);

  const handleSave = () => {
    if (!supplierId) {
      toast.error('Elegí un proveedor');
      return;
    }
    if (quantity <= 0) {
      toast.error('La cantidad tiene que ser mayor a 0');
      return;
    }
    addOrderItem(supplierId, {
      productName,
      quantity,
      unitCost,
      currentStock,
      coverageDays,
      avgMonthlyUnits,
      notes: notes.trim() || undefined,
      addedAt: new Date().toISOString(),
    });
    toast.success(`"${productName}" agregado al pedido de ${selectedSupplier?.name}`, {
      description: `${quantity} unidades — vas a Proveedores para cargar el pedido cuando esté completo.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Agregar a pedido
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{productName}</span>
            <br />
            Stock actual: <strong>{currentStock}</strong> uds · Cobertura: <strong>{Math.round(coverageDays)}d</strong> · Venta/mes: <strong>{avgMonthlyUnits.toFixed(1)}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Proveedor */}
          <div className="space-y-1">
            <Label className="text-sm flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              Proveedor
            </Label>
            {preAssignedSupplierId && preAssignedSupplierName ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{preAssignedSupplierName}</span>
                <span className="text-muted-foreground text-xs ml-2">(asignado al producto)</span>
              </div>
            ) : suppliers.length === 0 ? (
              <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                <span>Cargá al menos un proveedor en /proveedores antes de armar pedidos.</span>
              </div>
            ) : (
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Elegí un proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-sm">
                      {s.name}
                      {s.lead_time_promised_days != null && (
                        <span className="text-muted-foreground ml-1">({s.lead_time_promised_days}d)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Cobertura objetivo (presets) */}
          {avgMonthlyUnits > 0 && (
            <div className="space-y-1">
              <Label className="text-sm">Cubrir cuántos días</Label>
              <div className="flex gap-1">
                {COVERAGE_PRESETS.map(p => (
                  <Button
                    key={p.days}
                    type="button"
                    variant={coverageTarget === p.days ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs flex-1"
                    onClick={() => setCoverageTarget(p.days)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Vendés ~{avgMonthlyUnits.toFixed(0)} uds/mes. Cubrir {coverageTarget}d + {supplierLeadDays}d de lead time = {Math.ceil((avgMonthlyUnits * (coverageTarget + supplierLeadDays)) / 30)} uds totales necesarias.
              </p>
            </div>
          )}

          {/* Cantidad final */}
          <div className="space-y-1">
            <Label htmlFor="qty" className="text-sm">Cantidad a pedir</Label>
            <Input
              id="qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="text-right tabular-nums"
            />
            {totalCost > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Costo estimado: <strong>${totalCost.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</strong>
              </p>
            )}
          </div>

          {/* Notas */}
          <div className="space-y-1">
            <Label htmlFor="notes" className="text-sm">Nota (opcional)</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Ej: pedir antes del fin de mes, llamar antes de despachar..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!supplierId || quantity <= 0} className="gap-1">
            <ShoppingCart className="h-4 w-4" />
            Agregar al pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
