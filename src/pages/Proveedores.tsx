/**
 * Proveedores (Ola 15).
 *
 * MVP — CRUD básico de proveedores + entregas. Permite cargar:
 *   - Datos del proveedor (nombre, contacto, lead time prometido).
 *   - Productos que vende (matching por nombre con stock).
 *   - Entregas con fecha pedido / promesa / recepción → calculamos
 *     el lead time real.
 *
 * El lead time efectivo de cada producto (override > real > promesa) se
 * usa en Stock.tsx (Ola 16) en vez del hardcoded 20 días.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Truck, Plus, Edit, Trash2, Calendar, Package, Loader2, CheckCircle2, XCircle, Clock, Info, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useSuppliers, computeRealLeadTime, computeDeliveryAccuracy, type Supplier, type SupplierDelivery } from '@/hooks/useSuppliers';

interface SupplierFormState {
  name: string;
  email: string;
  phone: string;
  cuit: string;
  contact_person: string;
  lead_time_promised_days: string;
  notes: string;
}

const EMPTY_SUPPLIER: SupplierFormState = {
  name: '', email: '', phone: '', cuit: '', contact_person: '', lead_time_promised_days: '', notes: '',
};

export default function Proveedores() {
  const {
    suppliers, deliveries, loading, error,
    createSupplier, updateSupplier, deleteSupplier,
    createDelivery, updateDelivery,
    deliveriesBySupplier,
  } = useSuppliers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierFormState>(EMPTY_SUPPLIER);
  const [saving, setSaving] = useState(false);

  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliverySupplierId, setDeliverySupplierId] = useState<string | null>(null);
  const [deliveryForm, setDeliveryForm] = useState({ ordered_at: '', promised_at: '', notes: '' });

  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_SUPPLIER);
    setDialogOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      email: s.email ?? '',
      phone: s.phone ?? '',
      cuit: s.cuit ?? '',
      contact_person: s.contact_person ?? '',
      lead_time_promised_days: s.lead_time_promised_days != null ? String(s.lead_time_promised_days) : '',
      notes: s.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre del proveedor es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        cuit: form.cuit.trim() || null,
        contact_person: form.contact_person.trim() || null,
        lead_time_promised_days: form.lead_time_promised_days ? parseInt(form.lead_time_promised_days, 10) : null,
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        await updateSupplier(editingId, payload);
        toast.success('Proveedor actualizado');
      } else {
        await createSupplier(payload);
        toast.success('Proveedor creado');
      }
      setDialogOpen(false);
    } catch (err) {
      const e = err as { message?: string };
      toast.error('Error al guardar', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: Supplier) => {
    try {
      await deleteSupplier(s.id);
      toast.success(`"${s.name}" eliminado`);
      setConfirmDelete(null);
    } catch (err) {
      const e = err as { message?: string };
      toast.error('Error al eliminar', { description: e.message });
    }
  };

  const openCreateDelivery = (supplierId: string) => {
    setDeliverySupplierId(supplierId);
    setDeliveryForm({ ordered_at: new Date().toISOString().slice(0, 10), promised_at: '', notes: '' });
    setDeliveryDialogOpen(true);
  };

  const handleSaveDelivery = async () => {
    if (!deliverySupplierId || !deliveryForm.ordered_at) {
      toast.error('La fecha del pedido es obligatoria');
      return;
    }
    try {
      await createDelivery({
        supplier_id: deliverySupplierId,
        ordered_at: deliveryForm.ordered_at,
        promised_at: deliveryForm.promised_at || null,
        received_at: null,
        status: 'pending',
        quantity: null,
        notes: deliveryForm.notes.trim() || null,
      });
      toast.success('Pedido registrado');
      setDeliveryDialogOpen(false);
    } catch (err) {
      const e = err as { message?: string };
      toast.error('Error al registrar pedido', { description: e.message });
    }
  };

  const handleMarkReceived = async (d: SupplierDelivery) => {
    try {
      await updateDelivery(d.id, { received_at: new Date().toISOString().slice(0, 10), status: 'received' });
      toast.success('Entrega marcada como recibida');
    } catch (err) {
      const e = err as { message?: string };
      toast.error('Error', { description: e.message });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <h1 className="text-2xl font-bold">Proveedores</h1>
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-5xl">
        <h1 className="text-2xl font-bold">Proveedores</h1>
        <Card className="border-destructive">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">No pudimos cargar los proveedores</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="h-6 w-6" />
              Proveedores
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cargá tus proveedores con tiempos de entrega prometidos. Cuando registres entregas, el sistema calcula el lead time real y ajusta solo las alertas de reposición de stock.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo proveedor
          </Button>
        </div>

        {suppliers.length === 0 ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center gap-3">
              <Truck className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <p className="font-medium">Sin proveedores cargados</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Cargá tu primer proveedor para empezar a hacer un seguimiento de tiempos de entrega y ajustar las alertas de stock automáticamente.
                </p>
              </div>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                Cargar proveedor
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {suppliers.map(s => {
              const supDeliveries = deliveriesBySupplier(s.id);
              const realLT = computeRealLeadTime(supDeliveries);
              const accuracy = computeDeliveryAccuracy(supDeliveries);
              const pending = supDeliveries.filter(d => d.status === 'pending');

              return (
                <Card key={s.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base">{s.name}</CardTitle>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                          {s.contact_person && <span>👤 {s.contact_person}</span>}
                          {s.email && <span>✉️ {s.email}</span>}
                          {s.phone && <span>📞 {s.phone}</span>}
                          {s.cuit && <span>CUIT: {s.cuit}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(s)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">Editar</p></TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(s)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">Eliminar</p></TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg border p-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Promete
                        </p>
                        <p className="text-lg font-bold tabular-nums mt-0.5">
                          {s.lead_time_promised_days != null ? `${s.lead_time_promised_days} días` : '—'}
                        </p>
                      </div>
                      <div className="rounded-lg border p-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Real (avg)
                        </p>
                        <p className="text-lg font-bold tabular-nums mt-0.5">
                          {realLT != null ? `${realLT} días` : '—'}
                        </p>
                        {realLT != null && supDeliveries.filter(d => d.status === 'received').length > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            sobre {supDeliveries.filter(d => d.status === 'received').length} entrega(s)
                          </p>
                        )}
                      </div>
                      <div className="rounded-lg border p-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                          <Info className="h-3 w-3" /> Diferencia
                        </p>
                        <p className={`text-lg font-bold tabular-nums mt-0.5 ${accuracy != null && accuracy > 2 ? 'text-warning' : accuracy != null && accuracy < -2 ? 'text-success' : ''}`}>
                          {accuracy == null ? '—' : accuracy > 0 ? `+${accuracy}d` : `${accuracy}d`}
                        </p>
                        {accuracy != null && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {accuracy > 0 ? 'tarda más que lo prometido' : accuracy < 0 ? 'entrega antes' : 'puntual'}
                          </p>
                        )}
                      </div>
                    </div>

                    {s.notes && (
                      <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">"{s.notes}"</p>
                    )}

                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          Entregas ({supDeliveries.length})
                          {pending.length > 0 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                              {pending.length} pendiente(s)
                            </span>
                          )}
                        </p>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openCreateDelivery(s.id)}>
                          <Plus className="h-3 w-3" />
                          Registrar pedido
                        </Button>
                      </div>
                      {supDeliveries.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          Aún no registraste entregas. Cargá un pedido y al recibirlo marcalo como "recibido" — así el sistema aprende el lead time real.
                        </p>
                      ) : (
                        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                          {supDeliveries.slice(0, 6).map(d => {
                            const isLate = d.status === 'pending' && d.promised_at && new Date(d.promised_at) < new Date();
                            return (
                              <li key={d.id} className="flex items-center gap-2 text-xs">
                                {d.status === 'received' ? <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                                  : d.status === 'cancelled' ? <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                  : isLate ? <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                  : <Clock className="h-3.5 w-3.5 text-warning shrink-0" />}
                                <span className="text-muted-foreground">Pedido {new Date(d.ordered_at).toLocaleDateString('es-AR')}</span>
                                {d.promised_at && (
                                  <span className="text-muted-foreground">→ promesa {new Date(d.promised_at).toLocaleDateString('es-AR')}</span>
                                )}
                                {d.received_at && (
                                  <span className="text-success">✓ {new Date(d.received_at).toLocaleDateString('es-AR')}</span>
                                )}
                                {d.status === 'pending' && (
                                  <Button variant="ghost" size="sm" className="h-6 text-[11px] ml-auto" onClick={() => handleMarkReceived(d)}>
                                    Marcar recibido
                                  </Button>
                                )}
                              </li>
                            );
                          })}
                          {supDeliveries.length > 6 && (
                            <li className="text-[10px] text-muted-foreground text-center pt-1">
                              + {supDeliveries.length - 6} entregas anteriores
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Dialog: crear/editar proveedor */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
              <DialogDescription>
                Completá los datos del proveedor. El tiempo prometido se usa para calcular alertas de reposición de stock.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="sup-name">Nombre / Razón social *</Label>
                <Input id="sup-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-contact">Persona de contacto</Label>
                <Input id="sup-contact" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-cuit">CUIT</Label>
                <Input id="sup-cuit" value={form.cuit} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-email">Email</Label>
                <Input id="sup-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-phone">Teléfono</Label>
                <Input id="sup-phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="sup-lead">Tiempo de entrega prometido (días)</Label>
                <Input
                  id="sup-lead"
                  type="number"
                  min={0}
                  max={365}
                  value={form.lead_time_promised_days}
                  onChange={e => setForm(f => ({ ...f, lead_time_promised_days: e.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Cuántos días dice el proveedor que tarda en entregar. El sistema lo compara contra entregas reales para detectar desvíos.
                </p>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="sup-notes">Notas</Label>
                <Textarea id="sup-notes" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingId ? 'Guardar cambios' : 'Crear')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: registrar pedido */}
        <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Registrar pedido</DialogTitle>
              <DialogDescription>
                Cuando el pedido llegue, marcalo como "recibido" para que el sistema calcule el lead time real.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="deliv-ordered">Fecha del pedido *</Label>
                <Input id="deliv-ordered" type="date" value={deliveryForm.ordered_at} onChange={e => setDeliveryForm(f => ({ ...f, ordered_at: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="deliv-promised">Fecha prometida de entrega</Label>
                <Input id="deliv-promised" type="date" value={deliveryForm.promised_at} onChange={e => setDeliveryForm(f => ({ ...f, promised_at: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="deliv-notes">Notas</Label>
                <Textarea id="deliv-notes" rows={2} value={deliveryForm.notes} onChange={e => setDeliveryForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeliveryDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveDelivery}>Registrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm delete */}
        <Dialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                ¿Eliminar proveedor?
              </DialogTitle>
              <DialogDescription>
                Vas a eliminar <strong>{confirmDelete?.name}</strong> y todas sus entregas registradas. Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => confirmDelete && handleDelete(confirmDelete)}>Eliminar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
