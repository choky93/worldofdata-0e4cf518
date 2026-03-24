import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { mockFinancial, mockCashFlow, mockExpenses } from '@/lib/mock-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { HelpCircle, Plus, ArrowDownCircle, ArrowUpCircle, Trash2, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LedgerEntry {
  id: string;
  type: 'ingreso' | 'egreso';
  amount: number;
  category: string;
  note: string;
  date: string;
}

const mockLedger: LedgerEntry[] = [
  { id: '1', type: 'ingreso', amount: 85000, category: 'Venta sin factura', note: 'Venta directa filamentos a particular', date: '2026-03-18' },
  { id: '2', type: 'egreso', amount: 12000, category: 'Gastos varios', note: 'Envíos informales', date: '2026-03-17' },
  { id: '3', type: 'ingreso', amount: 45000, category: 'Cobro pendiente', note: 'Cobro parcial Dental3D (no facturado)', date: '2026-03-15' },
  { id: '4', type: 'egreso', amount: 28000, category: 'Mantenimiento', note: 'Reparación impresora del taller', date: '2026-03-14' },
  { id: '5', type: 'ingreso', amount: 120000, category: 'Servicio', note: 'Impresión piezas custom (pago en efectivo)', date: '2026-03-12' },
  { id: '6', type: 'egreso', amount: 55000, category: 'Proveedor', note: 'Compra insumos mercado informal', date: '2026-03-10' },
];

const CATEGORIES_INGRESO = ['Venta sin factura', 'Cobro pendiente', 'Servicio', 'Otro'];
const CATEGORIES_EGRESO = ['Gastos varios', 'Mantenimiento', 'Proveedor', 'Sueldos informales', 'Otro'];

export default function Finanzas() {
  const [ledger, setLedger] = useState<LedgerEntry[]>(mockLedger);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<'ingreso' | 'egreso'>('ingreso');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formNote, setFormNote] = useState('');

  const totalIngresos = ledger.filter(e => e.type === 'ingreso').reduce((s, e) => s + e.amount, 0);
  const totalEgresos = ledger.filter(e => e.type === 'egreso').reduce((s, e) => s + e.amount, 0);
  const netOperativo = totalIngresos - totalEgresos;

  const addEntry = () => {
    if (!formAmount || !formCategory) return;
    const entry: LedgerEntry = {
      id: Date.now().toString(),
      type: formType,
      amount: parseInt(formAmount),
      category: formCategory,
      note: formNote,
      date: new Date().toISOString().split('T')[0],
    };
    setLedger([entry, ...ledger]);
    setFormAmount('');
    setFormCategory('');
    setFormNote('');
    setShowForm(false);
  };

  const removeEntry = (id: string) => setLedger(ledger.filter(e => e.id !== id));

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold tracking-tight">Finanzas</h1>

        <Tabs defaultValue="comparativa">
          <TabsList>
            <TabsTrigger value="comparativa">Vista comparativa</TabsTrigger>
            <TabsTrigger value="financiero">Presup. Financiero</TabsTrigger>
            <TabsTrigger value="economico">Presup. Económico</TabsTrigger>
            <TabsTrigger value="bitacora" className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Bitácora Operativa
            </TabsTrigger>
          </TabsList>

          {/* ─── Comparativa ──────────────────────────────── */}
          <TabsContent value="comparativa" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="module-border-finanzas">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-1">
                    Presupuesto Financiero (Devengado)
                    <Tooltip><TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs"><p className="text-xs">Lo que se GENERÓ comercialmente. Ej: vendiste $1.300 en 3 cuotas → registra $1.300 como venta.</p></TooltipContent></Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Row label="Ventas totales" value={mockFinancial.financial.totalSales} />
                  <Row label="Costos totales" value={-mockFinancial.financial.totalCosts} negative />
                  <div className="border-t pt-2">
                    <Row label="Resultado neto" value={mockFinancial.financial.netResult} bold />
                  </div>
                </CardContent>
              </Card>

              <Card className="module-border-finanzas">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-1">
                    Presupuesto Económico (Caja)
                    <Tooltip><TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs"><p className="text-xs">Lo que EFECTIVAMENTE entró y salió. Ej: de $1.300 en cuotas, solo cobraste $400 este mes.</p></TooltipContent></Tooltip>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Row label="Ingresos efectivos" value={mockFinancial.economic.totalIncome} />
                  <Row label="Egresos efectivos" value={-mockFinancial.economic.totalExpenses} negative />
                  <div className="border-t pt-2">
                    <Row label="Flujo neto" value={mockFinancial.economic.netCash} bold />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-4">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-2">Diferencia entre devengado y caja</p>
                <p className="kpi-value">
                  {formatCurrency(mockFinancial.financial.netResult - mockFinancial.economic.netCash)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Plata que generaste pero todavía no cobraste</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="financiero" className="mt-4">
            <Card><CardContent className="pt-6 text-center text-muted-foreground">Vista detallada del presupuesto financiero — próximamente con datos reales</CardContent></Card>
          </TabsContent>
          <TabsContent value="economico" className="mt-4">
            <Card><CardContent className="pt-6 text-center text-muted-foreground">Vista detallada del presupuesto económico — próximamente con datos reales</CardContent></Card>
          </TabsContent>

          {/* ─── Bitácora Operativa ───────────────────────── */}
          <TabsContent value="bitacora" className="mt-4 space-y-4">
            {/* Summary cards */}
            <div className="grid gap-3 grid-cols-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <ArrowDownCircle className="h-3 w-3 text-success" /> Ingresos operativos
                  </p>
                  <p className="kpi-value text-success">{formatCurrency(totalIngresos)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <ArrowUpCircle className="h-3 w-3 text-destructive" /> Egresos operativos
                  </p>
                  <p className="kpi-value text-destructive">{formatCurrency(totalEgresos)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Neto operativo</p>
                  <p className={`kpi-value ${netOperativo >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(netOperativo)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Info banner */}
            <div className="bg-primary/[0.05] border border-primary/10 rounded-xl px-4 py-3 flex items-start gap-3">
              <BookOpen className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Registro de la realidad económica</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Acá registrás ingresos y egresos que no pasan por facturación. Solo vos (admin) tenés acceso a esta sección. Es confidencial.
                </p>
              </div>
            </div>

            {/* Add button / Form */}
            <div className="flex justify-end">
              <Button onClick={() => setShowForm(!showForm)} variant={showForm ? 'secondary' : 'default'} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                {showForm ? 'Cancelar' : 'Nuevo registro'}
              </Button>
            </div>

            <AnimatePresence>
              {showForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card>
                    <CardContent className="pt-5 space-y-4">
                      <div className="flex gap-2">
                        <Button size="sm" variant={formType === 'ingreso' ? 'default' : 'outline'}
                          onClick={() => { setFormType('ingreso'); setFormCategory(''); }}
                          className={formType === 'ingreso' ? 'bg-success hover:bg-success/90' : ''}>
                          <ArrowDownCircle className="h-3.5 w-3.5 mr-1" /> Ingreso
                        </Button>
                        <Button size="sm" variant={formType === 'egreso' ? 'default' : 'outline'}
                          onClick={() => { setFormType('egreso'); setFormCategory(''); }}
                          className={formType === 'egreso' ? 'bg-destructive hover:bg-destructive/90' : ''}>
                          <ArrowUpCircle className="h-3.5 w-3.5 mr-1" /> Egreso
                        </Button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Monto</Label>
                          <Input type="number" placeholder="$0" value={formAmount} onChange={e => setFormAmount(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Categoría</Label>
                          <div className="flex flex-wrap gap-1">
                            {(formType === 'ingreso' ? CATEGORIES_INGRESO : CATEGORIES_EGRESO).map(c => (
                              <Button key={c} type="button" size="sm" variant={formCategory === c ? 'default' : 'outline'}
                                className="h-7 text-[11px]" onClick={() => setFormCategory(c)}>
                                {c}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Nota (opcional)</Label>
                          <Input placeholder="Descripción breve..." value={formNote} onChange={e => setFormNote(e.target.value)} />
                        </div>
                      </div>
                      <Button onClick={addEntry} disabled={!formAmount || !formCategory} size="sm">
                        Guardar registro
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ledger table */}
            <Card>
              <CardContent className="pt-5">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Nota</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Badge className={`border-0 text-[11px] ${entry.type === 'ingreso' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
                            {entry.type === 'ingreso' ? '↓ Ingreso' : '↑ Egreso'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{entry.category}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{entry.note}</TableCell>
                        <TableCell className="text-sm tabular-nums">{formatDate(entry.date)}</TableCell>
                        <TableCell className={`text-right font-semibold tabular-nums ${entry.type === 'ingreso' ? 'text-success' : 'text-destructive'}`}>
                          {entry.type === 'egreso' ? '-' : '+'}{formatCurrency(entry.amount)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeEntry(entry.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Gastos del mes */}
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Gastos del mes</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Concepto</TableHead><TableHead>Vencimiento</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Monto</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {mockExpenses.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{e.name}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(e.dueDate)}</TableCell>
                    <TableCell>
                      <Badge className={`border-0 ${e.status === 'paid' ? 'bg-success/15 text-success' : e.status === 'overdue' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}>
                        {e.status === 'paid' ? 'Pagado' : e.status === 'overdue' ? 'Vencido' : 'Pendiente'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(e.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function Row({ label, value, negative, bold }: { label: string; value: number; negative?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={bold ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold text-lg' : 'font-medium'} ${negative ? 'text-destructive' : ''}`}>
        {formatCurrency(Math.abs(value))}
      </span>
    </div>
  );
}
