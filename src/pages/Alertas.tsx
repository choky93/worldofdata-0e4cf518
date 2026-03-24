import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mockAlerts } from '@/lib/mock-data';
import { formatDate } from '@/lib/formatters';
import { Package, Users, Wallet, TrendingUp, Check, Bell, ArrowRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const typeIcons = { stock: Package, clients: Users, finance: Wallet, forecast: TrendingUp };
const typeLabels = { stock: 'Stock', clients: 'Clientes', finance: 'Finanzas', forecast: 'Forecast' };

export default function Alertas() {
  const [alerts, setAlerts] = useState(mockAlerts);
  const unread = alerts.filter(a => !a.read).length;

  const markRead = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Alertas
            {unread > 0 && <Badge variant="destructive">{unread} sin leer</Badge>}
          </h1>
          <Button variant="outline" size="sm" onClick={() => setAlerts(prev => prev.map(a => ({ ...a, read: true })))}>
            Marcar todas como leídas
          </Button>
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
