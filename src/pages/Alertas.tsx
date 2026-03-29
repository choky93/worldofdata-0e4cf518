import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useExtractedData } from '@/hooks/useExtractedData';
import { formatDate } from '@/lib/formatters';
import { Package, Users, Wallet, TrendingUp, Check, Bell, ArrowRight, Upload, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';

const typeIcons = { stock: Package, clientes: Users, finanzas: Wallet, forecast: TrendingUp };
const typeLabels = { stock: 'Stock', clientes: 'Clientes', finanzas: 'Finanzas', forecast: 'Forecast' };

type AlertType = { id: string; type: 'stock' | 'clientes' | 'finanzas' | 'forecast'; priority: 'high' | 'medium' | 'low'; message: string; suggestion?: string; read: boolean; date: string };

function buildAlertsFromData(data: ReturnType<typeof useExtractedData>['data']): AlertType[] {
  const alerts: AlertType[] = [];
  if (!data) return alerts;

  const today = new Date().toISOString().split('T')[0];

  // Stock alerts
  const stockRows = data.stock || [];
  const lowStock = stockRows.filter((r: any) => {
    const stock = parseInt(r.stock || r.cantidad || r.unidades || 0) || 0;
    const min = parseInt(r.stock_minimo || r.min_stock || r.minimo || 0) || 0;
    return min > 0 && stock < min;
  });
  if (lowStock.length > 0) {
    const names = lowStock.slice(0, 3).map((r: any) => r.nombre || r.producto || r.name || 'producto').join(', ');
    alerts.push({
      id: 'stock-low',
      type: 'stock',
      priority: 'high',
      message: `${lowStock.length} producto${lowStock.length > 1 ? 's' : ''} con stock por debajo del mínimo: ${names}`,
      suggestion: 'Revisá el módulo de Stock para ver el detalle y reponer a tiempo.',
      read: false,
      date: today,
    });
  }

  // Clientes: cobros pendientes
  const clientRows = data.clientes || [];
  const withDebt = clientRows.filter((r: any) => {
    const deuda = parseFloat(r.deuda || r.saldo || r.pendiente || r.deuda_pendiente || 0) || 0;
    return deuda > 0;
  });
  if (withDebt.length > 0) {
    const totalDeuda = withDebt.reduce((s: number, r: any) => s + (parseFloat(r.deuda || r.saldo || r.pendiente || 0) || 0), 0);
    alerts.push({
      id: 'clientes-debt',
      type: 'clientes',
      priority: 'medium',
      message: `${withDebt.length} cliente${withDebt.length > 1 ? 's' : ''} con cobros pendientes por $${totalDeuda.toLocaleString('es-AR')}`,
      suggestion: 'Contactalos para gestionar el cobro.',
      read: false,
      date: today,
    });
  }

  // Gastos: pagos vencidos
  const gastosRows = data.gastos || [];
  const overdue = gastosRows.filter((r: any) => {
    const status = (r.estado || r.status || '').toLowerCase();
    return status === 'vencido' || status === 'overdue';
  });
  if (overdue.length > 0) {
    alerts.push({
      id: 'gastos-overdue',
      type: 'finanzas',
      priority: 'high',
      message: `${overdue.length} pago${overdue.length > 1 ? 's' : ''} vencido${overdue.length > 1 ? 's' : ''} sin regularizar`,
      suggestion: 'Revisá el módulo de Finanzas para ver los pagos vencidos.',
      read: false,
      date: today,
    });
  }

  return alerts;
}

export default function Alertas() {
  const { data: extractedData, hasData, loading } = useExtractedData();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const baseAlerts = hasData ? buildAlertsFromData(extractedData) : [];
  const alerts = baseAlerts.map(a => ({ ...a, read: readIds.has(a.id) }));
  const unread = alerts.filter(a => !a.read).length;

  const markRead = (id: string) => setReadIds(prev => new Set([...prev, id]));
  const markAllRead = () => setReadIds(new Set(alerts.map(a => a.id)));

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <h1 className="text-2xl font-bold">Alertas</h1>
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Analizando tus datos...</span>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <TooltipProvider>
        <div className="space-y-6 max-w-4xl">
          <h1 className="text-2xl font-bold">Alertas</h1>
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Bell className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="text-lg font-medium">Sin alertas por ahora</p>
              <p className="text-muted-foreground mt-1 max-w-md">
                Las alertas se generan automáticamente a partir de tus datos: stock bajo, cobros pendientes, pagos vencidos y más.
                Cargá tus archivos para empezar.
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
      </TooltipProvider>
    );
  }

  if (alerts.length === 0) {
    return (
      <TooltipProvider>
        <div className="space-y-6 max-w-4xl">
          <h1 className="text-2xl font-bold">Alertas</h1>
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Check className="h-12 w-12 text-success/50" />
            <div>
              <p className="text-lg font-medium">Todo en orden</p>
              <p className="text-muted-foreground mt-1">No hay alertas activas basadas en tus datos cargados.</p>
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Alertas
            {unread > 0 && <Badge variant="destructive">{unread} sin leer</Badge>}
          </h1>
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              Marcar todas como leídas
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {alerts.map(alert => {
            const Icon = typeIcons[alert.type] || Bell;
            return (
              <Card key={alert.id} className={`border-l-4 ${
                alert.priority === 'high' ? 'border-l-destructive' :
                alert.priority === 'medium' ? 'border-l-warning' : 'border-l-primary'
              } ${alert.read ? 'opacity-60' : ''}`}>
                <CardContent className="py-4 flex items-start gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!alert.read ? 'font-medium' : ''}`}>{alert.message}</p>
                    {alert.suggestion && !alert.read && (
                      <div className="mt-2 bg-muted/50 rounded-lg p-2.5 text-xs text-muted-foreground flex items-start gap-2">
                        <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                        <span><strong className="text-foreground">Sugerencia:</strong> {alert.suggestion}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">{typeLabels[alert.type]}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(alert.date)}</span>
                    </div>
                  </div>
                  {!alert.read && (
                    <Button variant="ghost" size="sm" onClick={() => markRead(alert.id)} className="shrink-0">
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
