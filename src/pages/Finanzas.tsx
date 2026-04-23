import { useState } from 'react';
import { usePeriod } from '@/contexts/PeriodContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { findNumber, findString, findDateRaw, FIELD_AMOUNT, FIELD_NAME, FIELD_DATE } from '@/lib/field-utils';
import { useExtractedData } from '@/hooks/useExtractedData';
import { filterByPeriod, type PeriodKey } from '@/lib/data-cleaning';
import { PeriodPills } from '@/components/ui/PeriodPills';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { HelpCircle, Plus, ArrowDownCircle, ArrowUpCircle, Trash2, BookOpen, Upload, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

interface LedgerEntry {
  id: string;
  type: 'ingreso' | 'egreso';
  amount: number;
  category: string;
  note: string;
  date: string;
}

const CATEGORIES_INGRESO = ['Venta sin factura', 'Cobro pendiente', 'Servicio', 'Otro'];
const CATEGORIES_EGRESO = ['Gastos varios', 'Mantenimiento', 'Proveedor', 'Sueldos informales', 'Otro'];

interface ExpenseRow {
  name: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
}

function normalizeExpenses(rows: any[], mG?: Record<string, string>): ExpenseRow[] {
  return rows.map((r: any) => {
    const statusRaw = findString(r, ['estado', 'status'], mG?.status).toLowerCase();
    let status: 'paid' | 'pending' | 'overdue' = 'pending';
    if (statusRaw === 'pagado' || statusRaw === 'paid') status = 'paid';
    else if (statusRaw === 'vencido' || statusRaw === 'overdue') status = 'overdue';
    return {
      name: findString(r, FIELD_NAME, mG?.name) || 'Gasto',
      amount: findNumber(r, FIELD_AMOUNT, mG?.amount),
      dueDate: findString(r, ['vencimiento', 'fecha_vencimiento', 'due_date', ...FIELD_DATE], mG?.date) || findDateRaw(r, mG?.date),
      status,
    };
  });
}

export default function Finanzas() {
  const { data: extractedData, mappings, hasData, availableMonths } = useExtractedData();
  const mV = mappings.ventas;
  const mG = mappings.gastos;
  const { period, setPeriod } = usePeriod();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
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

  // Derive financial data from extracted records, filtered by period
  const allVentas = extractedData?.ventas || [];
  const allGastos = extractedData?.gastos || [];
  const allFacturas = extractedData?.facturas || [];
  const mF = mappings.facturas;
  const realVentas = period === 'all' ? allVentas : filterByPeriod(allVentas, FIELD_DATE, period, (row) => findDateRaw(row, mV?.date));
  const realGastos = period === 'all' ? allGastos : filterByPeriod(allGastos, FIELD_DATE, period, (row) => findDateRaw(row, mG?.date));
  const realFacturas = period === 'all' ? allFacturas : filterByPeriod(allFacturas, FIELD_DATE, period, (row) => findDateRaw(row, mF?.date));

  const totalVentasReal = realVentas.reduce((s: number, r: any) => s + findNumber(r, FIELD_AMOUNT, mV?.amount), 0);
  const totalGastosReal = realGastos.reduce((s: number, r: any) => s + findNumber(r, FIELD_AMOUNT, mG?.amount), 0);
  const totalFacturasReal = realFacturas.reduce((s: number, r: any) => s + findNumber(r, FIELD_AMOUNT, mF?.amount), 0);

  const hasFinancialData = hasData && (realVentas.length > 0 || realGastos.length > 0 || realFacturas.length > 0);
  const expenses: ExpenseRow[] = hasData && realGastos.length > 0 ? normalizeExpenses(realGastos, mG) : [];

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Finanzas</h1>
          <div className="flex items-center gap-3">
            <PeriodPills value={period} onChange={setPeriod} availableMonths={availableMonths} />
            {hasFinancialData ? (
              <div className="flex items-center gap-1.5 text-xs alert-success rounded-lg px-3 py-1.5">
                <Database className="h-3.5 w-3.5" />
                Datos reales cargados
              </div>
            ) : (
              <Link to="/carga-datos" className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-1.5 border border-border hover:text-primary transition-colors">
                <Upload className="h-3.5 w-3.5" />
                Cargá tus archivos financieros
              </Link>
            )}
          </div>
        </div>

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
            {hasFinancialData ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="module-border-finanzas">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-1">
                      Ingresos (Ventas)
                      <Tooltip><TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs"><p className="text-xs">Total acumulado de registros de ventas cargados.</p></TooltipContent></Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Row label="Total ventas" value={totalVentasReal} />
                    {totalFacturasReal > 0 && <Row label="Total facturas" value={totalFacturasReal} />}
                    <Row label="Registros" value={realVentas.length + realFacturas.length} isCount />
                  </CardContent>
                </Card>

                <Card className="module-border-finanzas">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-1">
                      Egresos (Gastos)
                      <Tooltip><TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs"><p className="text-xs">Total acumulado de registros de gastos cargados.</p></TooltipContent></Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Row label="Total gastos" value={totalGastosReal} />
                    <Row label="Registros" value={realGastos.length} isCount />
                  </CardContent>
                </Card>

                {totalVentasReal > 0 && (
                  <Card className="md:col-span-2">
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground mb-2">Resultado neto (Ventas − Gastos)</p>
                      <p className={`kpi-value ${totalVentasReal - totalGastosReal >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {formatCurrency(totalVentasReal - totalGastosReal)}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <p className="text-muted-foreground">Sin datos financieros cargados.</p>
                <Link to="/carga-datos">
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Cargar archivos de ventas y gastos
                  </Button>
                </Link>
              </div>
            )}
          </TabsContent>

          <TabsContent value="financiero" className="mt-4">
            <Card><CardContent className="pt-6 text-center text-muted-foreground">Vista detallada del presupuesto financiero — disponible cuando cargues archivos con datos de ventas</CardContent></Card>
          </TabsContent>
          <TabsContent value="economico" className="mt-4">
            <Card><CardContent className="pt-6 text-center text-muted-foreground">Vista detallada del presupuesto económico — disponible cuando cargues archivos con datos de caja</CardContent></Card>
          </TabsContent>

          {/* ─── Bitácora Operativa ───────────────────────── */}
          <TabsContent value="bitacora" className="mt-4 space-y-4">
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

            <div className="rounded-xl px-4 py-3 flex items-start gap-3 border border-border" style={{ background: 'hsl(var(--pastel-mint) / 0.4)' }}>
              <BookOpen className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Registro de la realidad económica</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Acá registrás ingresos y egresos que no pasan por facturación. Solo vos (admin) tenés acceso a esta sección. Es confidencial.
                </p>
              </div>
            </div>

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

            <Card>
              <CardContent className="pt-5">
                {ledger.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-6">No hay registros todavía. Usá el botón "Nuevo registro" para agregar.</p>
                ) : (
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
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Gastos del mes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Gastos cargados {expenses.length > 0 && `(${expenses.length} registros)`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {hasData
                  ? 'No se encontraron registros de gastos en los archivos cargados.'
                  : 'Cargá archivos con gastos, facturas o egresos para verlos acá.'}
              </div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {expenses.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>{e.name}</TableCell>
                      <TableCell className="tabular-nums">
                        {e.dueDate ? (() => { try { return formatDate(e.dueDate); } catch { return e.dueDate; } })() : '—'}
                      </TableCell>
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
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function Row({ label, value, negative, bold, isCount }: { label: string; value: number; negative?: boolean; bold?: boolean; isCount?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={bold ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold text-lg' : 'font-medium'} ${negative ? 'text-destructive' : ''}`}>
        {isCount ? value : formatCurrency(Math.abs(value))}
      </span>
    </div>
  );
}
