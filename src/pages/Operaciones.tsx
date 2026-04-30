import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatters';
import { findNumber, findString, findDateRaw, FIELD_AMOUNT, FIELD_NAME, FIELD_DATE, FIELD_CLIENT, FIELD_CATEGORY } from '@/lib/field-utils';
import type { ColumnMapping } from '@/lib/field-utils';
import { parseDate, filterByPeriod, extractAvailableMonths } from '@/lib/data-cleaning';
import { useExtractedData } from '@/hooks/useExtractedData';
import { usePeriod } from '@/contexts/PeriodContext';
import { PeriodSelector } from '@/components/PeriodSelector';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileBox, Upload, Loader2, Database, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

type FilterType = 'all' | 'sale' | 'purchase';

interface OpRow {
  id: string;
  type: 'sale' | 'purchase';
  description: string;
  amount: number;
  date: string;
  counterpart: string;
  category: string;
}

function normalizeOps(ventas: any[], gastos: any[], mV?: ColumnMapping, mG?: ColumnMapping): OpRow[] {
  const ops: OpRow[] = [];

  ventas.forEach((r: any, i: number) => {
    ops.push({
      id: `v-${i}`,
      type: 'sale',
      description: findString(r, FIELD_NAME, mV?.name) || 'Venta',
      amount: findNumber(r, FIELD_AMOUNT, mV?.amount),
      date: findDateRaw(r, mV?.date),
      counterpart: findString(r, FIELD_CLIENT, mV?.client),
      category: findString(r, FIELD_CATEGORY, mV?.category) || 'Ventas',
    });
  });

  gastos.forEach((r: any, i: number) => {
    ops.push({
      id: `g-${i}`,
      type: 'purchase',
      description: findString(r, FIELD_NAME, mG?.name) || 'Gasto',
      amount: findNumber(r, FIELD_AMOUNT, mG?.amount),
      date: findString(r, ['vencimiento', ...FIELD_DATE], mG?.date) || findDateRaw(r, mG?.date),
      counterpart: findString(r, ['proveedor', 'supplier', ...FIELD_CLIENT], mG?.client),
      category: findString(r, FIELD_CATEGORY, mG?.category) || 'Gastos',
    });
  });

  // Sort by date descending using robust parser
  return ops.sort((a, b) => {
    const da = a.date ? parseDate(a.date) : null;
    const db = b.date ? parseDate(b.date) : null;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.getTime() - da.getTime();
  });
}

function fmtDate(raw: string): string {
  if (!raw || raw === '—') return '—';
  const d = parseDate(raw);
  if (d) return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  return raw;
}

const OP_PAGE_SIZE = 50;

export default function Operaciones() {
  const { data: extractedData, mappings, hasData, loading } = useExtractedData();
  const { period, setPeriod } = usePeriod();
  const [filter, setFilter] = useState<FilterType>('all');
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [period, filter]);

  // ── Cálculos derivados (todos los hooks arriba para respetar reglas de Hooks) ──
  // FIX hotfix: los useMemo de availableMonths y allOps estaban después de
  // los early returns por loading/!hasOps. Eso violaba las reglas de Hooks
  // y podía romper Operaciones en pantalla blanca al hidratar datos.
  const allVentas = extractedData?.ventas || [];
  const allGastos = extractedData?.gastos || [];
  const mV = mappings.ventas;
  const mG = mappings.gastos;

  const availableMonths = useMemo(
    () => extractAvailableMonths(allVentas, FIELD_DATE, (row) => findDateRaw(row, mV?.date)),
    [allVentas, mV]
  );

  const realVentas = period === 'all' ? allVentas : filterByPeriod(allVentas, FIELD_DATE, period, (row) => findDateRaw(row, mV?.date));
  const realGastos = period === 'all' ? allGastos : filterByPeriod(allGastos, FIELD_DATE, period, (row) => findDateRaw(row, mG?.date));
  const hasOps = hasData && (allVentas.length > 0 || allGastos.length > 0);

  const allOps = useMemo(() => normalizeOps(realVentas, realGastos, mappings.ventas, mappings.gastos), [realVentas, realGastos, mappings.ventas, mappings.gastos]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Operaciones</h1>
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando datos...</span>
        </div>
      </div>
    );
  }

  if (!hasOps) {
    return (
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Operaciones</h1>
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <FileBox className="h-12 w-12 text-muted-foreground/30" />
          <div>
            <p className="text-lg font-medium">Sin operaciones cargadas</p>
            <p className="text-muted-foreground mt-1 max-w-md">
              Cargá archivos de ventas, compras o gastos para ver el registro completo de operaciones de tu empresa.
            </p>
          </div>
          <Link to="/carga-datos">
            <Button className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Cargar archivos
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const filtered = filter === 'all' ? allOps : allOps.filter(op => op.type === filter);
  const totalPages = Math.ceil(filtered.length / OP_PAGE_SIZE);
  const pagedOps = filtered.slice(page * OP_PAGE_SIZE, (page + 1) * OP_PAGE_SIZE);
  const totalSales = allOps.filter(op => op.type === 'sale').reduce((s, op) => s + op.amount, 0);
  const totalPurchases = allOps.filter(op => op.type === 'purchase').reduce((s, op) => s + op.amount, 0);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Operaciones</h1>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} availableMonths={availableMonths} />
          <div className="flex items-center gap-1.5 text-xs alert-success rounded-lg px-3 py-1.5">
            <Database className="h-3.5 w-3.5" />
            {filtered.length} operaciones
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Total ventas</p>
          <p className="text-3xl font-bold text-success tabular-nums">{formatCurrency(totalSales)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Total gastos/compras</p>
          <p className="text-3xl font-bold text-destructive tabular-nums">{formatCurrency(totalPurchases)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Balance</p>
          <p className={`text-3xl font-bold tabular-nums ${totalSales - totalPurchases >= 0 ? 'text-success' : 'text-destructive'}`}>
            {formatCurrency(totalSales - totalPurchases)}
          </p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm text-muted-foreground">
              Registro de operaciones
              {totalPages > 1 && (
                <span className="ml-2 font-normal text-muted-foreground/60 text-xs">
                  · página {page + 1} de {totalPages}
                </span>
              )}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {(['all', 'sale', 'purchase'] as const).map(f => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilter(f)}
                className="text-xs h-7"
              >
                {f === 'all' ? 'Todas' : f === 'sale' ? 'Ventas' : 'Compras/Gastos'}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Contraparte</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {pagedOps.map(op => (
                <TableRow key={op.id}>
                  <TableCell className="tabular-nums">{fmtDate(op.date)}</TableCell>
                  <TableCell>
                    <Badge variant={op.type === 'sale' ? 'default' : 'outline'}>
                      {op.type === 'sale' ? 'Venta' : 'Compra/Gasto'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{op.category}</TableCell>
                  <TableCell>{op.description}</TableCell>
                  <TableCell>{op.counterpart || '—'}</TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${op.type === 'purchase' ? 'text-destructive' : 'text-success'}`}>
                    {op.type === 'purchase' ? '-' : '+'}{formatCurrency(op.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-3 w-3" /> Anterior
              </button>
              <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-30 transition-colors"
              >
                Siguiente <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
