import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/formatters';
import { mockFinancial, mockCashFlow, mockExpenses } from '@/lib/mock-data';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/formatters';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

export default function Finanzas() {
  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-7xl">
        <h1 className="text-2xl font-bold">Finanzas</h1>

        <Tabs defaultValue="comparativa">
          <TabsList>
            <TabsTrigger value="comparativa">Vista comparativa</TabsTrigger>
            <TabsTrigger value="financiero">Presupuesto Financiero</TabsTrigger>
            <TabsTrigger value="economico">Presupuesto Económico</TabsTrigger>
          </TabsList>

          <TabsContent value="comparativa" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-l-4 border-l-primary">
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

              <Card className="border-l-4 border-l-success">
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
                <p className="text-2xl font-bold tabular-nums">
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
        </Tabs>

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
