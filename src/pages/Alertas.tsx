import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useExtractedData } from '@/hooks/useExtractedData';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/formatters';
import { findNumber, findString, findDateRaw, FIELD_NAME, FIELD_STOCK_QTY, FIELD_STOCK_MIN, FIELD_DEBT, getStockUnits, getProductName, getQuantity, dedupeStockRows } from '@/lib/field-utils';
import { parseDate } from '@/lib/data-cleaning';
import type { CategoryMappings } from '@/hooks/useExtractedData';
import { Package, Users, Wallet, TrendingUp, Check, Bell, ArrowRight, Upload, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';

const typeIcons = { stock: Package, clientes: Users, finanzas: Wallet, forecast: TrendingUp };
const typeLabels = { stock: 'Stock', clientes: 'Clientes', finanzas: 'Finanzas', forecast: 'Forecast' };

type AlertType = { id: string; type: 'stock' | 'clientes' | 'finanzas' | 'forecast'; priority: 'high' | 'medium' | 'low'; message: string; suggestion?: string; read: boolean; date: string };

/** Slugify a string for use as part of alert_key */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
}

/**
 * Build product → average monthly units sold.
 * Same logic as Stock.tsx — denominator = months where THAT product had sales.
 */
function buildAvgMonthlyByProduct(ventasRows: any[], mV: any): Map<string, number> {
  const result = new Map<string, number>();
  if (!ventasRows || ventasRows.length === 0) return result;
  const totals = new Map<string, number>();
  const activeMonths = new Map<string, Set<string>>();
  for (const r of ventasRows) {
    const name = getProductName(r, mV?.name);
    if (!name) continue;
    const qty = getQuantity(r, mV?.quantity);
    if (!qty || qty <= 0) continue;
    const key = name.trim().toLowerCase();
    totals.set(key, (totals.get(key) || 0) + qty);
    const raw = findDateRaw(r, mV?.date);
    const d = parseDate(raw);
    if (d) {
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!activeMonths.has(key)) activeMonths.set(key, new Set());
      activeMonths.get(key)!.add(month);
    }
  }
  for (const [k, total] of totals) {
    const months = activeMonths.get(k)?.size || 1;
    result.set(k, total / months);
  }
  return result;
}

function buildAlertsFromData(data: ReturnType<typeof useExtractedData>['data'], mappings: CategoryMappings): AlertType[] {
  const alerts: AlertType[] = [];
  if (!data) return alerts;

  const today = new Date().toISOString().split('T')[0];

  // Stock alerts
  const mS = mappings.stock;
  const mV = mappings.ventas;
  const mC = mappings.clientes;
  const mG = mappings.gastos;
  const stockRows = data.stock || [];
  const ventasRows = data.ventas || [];

  if (stockRows.length > 0) {
    const LEAD_DAYS = 20; // días de anticipación para reponer
    const dedupedStock = dedupeStockRows(stockRows, mS?.name, mS?.stock_qty);
    const avgMonthlyByProduct = buildAvgMonthlyByProduct(ventasRows, mV);
    const hasVentasData = avgMonthlyByProduct.size > 0;

    const critical: string[] = [];
    const low: string[] = [];
    const overstock: string[] = [];
    const belowMin: string[] = []; // fallback: below explicit min_stock with no sales data

    for (const r of dedupedStock) {
      const stock = Math.round(getStockUnits(r, mS?.stock_qty));
      if (stock <= 0) continue;
      const name = getProductName(r, mS?.name) || 'producto';
      const avg = avgMonthlyByProduct.get(name.trim().toLowerCase()) || 0;

      if (avg > 0) {
        const coverageDays = (stock / avg) * 30;
        if (coverageDays < LEAD_DAYS * 0.5) critical.push(name); // < 10 days
        else if (coverageDays < LEAD_DAYS * 2) low.push(name);   // < 40 days
        else if (coverageDays > LEAD_DAYS * 6) overstock.push(name); // > 120 days
      } else {
        // No sales data: fall back to min_stock
        const min = Math.round(findNumber(r, FIELD_STOCK_MIN, mS?.stock_min));
        if (min > 0 && stock < min) belowMin.push(name);
      }
    }

    if (critical.length > 0) {
      const names = critical.slice(0, 3);
      alerts.push({
        id: `stock_critico_${critical.length}_${names.map(slugify).join('_')}`,
        type: 'stock',
        priority: 'high',
        message: `${critical.length} producto${critical.length > 1 ? 's' : ''} en riesgo crítico (menos de ${LEAD_DAYS / 2} días de cobertura): ${names.join(', ')}`,
        suggestion: 'Realizá el pedido de reposición lo antes posible para evitar quiebres de stock.',
        read: false,
        date: today,
      });
    }

    if (low.length > 0) {
      const names = low.slice(0, 3);
      alerts.push({
        id: `stock_bajo_${low.length}_${names.map(slugify).join('_')}`,
        type: 'stock',
        priority: 'medium',
        message: `${low.length} producto${low.length > 1 ? 's' : ''} con stock bajo (menos de ${LEAD_DAYS * 2} días de cobertura): ${names.join(', ')}`,
        suggestion: 'Revisá el módulo de Stock para planificar la reposición a tiempo.',
        read: false,
        date: today,
      });
    }

    if (overstock.length > 0 && hasVentasData) {
      const names = overstock.slice(0, 3);
      alerts.push({
        id: `stock_sobrestock_${overstock.length}_${names.map(slugify).join('_')}`,
        type: 'stock',
        priority: 'low',
        message: `${overstock.length} producto${overstock.length > 1 ? 's' : ''} con sobrestock (más de 120 días de cobertura): ${names.join(', ')}`,
        suggestion: 'Considerá liquidar o redirigir el exceso de inventario para liberar capital.',
        read: false,
        date: today,
      });
    }

    if (belowMin.length > 0) {
      const names = belowMin.slice(0, 3);
      alerts.push({
        id: `stock_bajo_minimo_${belowMin.length}_${names.map(slugify).join('_')}`,
        type: 'stock',
        priority: 'high',
        message: `${belowMin.length} producto${belowMin.length > 1 ? 's' : ''} con stock por debajo del mínimo: ${names.join(', ')}`,
        suggestion: 'Revisá el módulo de Stock para ver el detalle y reponer a tiempo.',
        read: false,
        date: today,
      });
    }
  }

  // Clientes: cobros pendientes
  const clientRows = data.clientes || [];
  const withDebt = clientRows.filter((r: any) => findNumber(r, FIELD_DEBT, mC?.debt) > 0);
  if (withDebt.length > 0) {
    const totalDeuda = withDebt.reduce((s: number, r: any) => s + findNumber(r, FIELD_DEBT, mC?.debt), 0);
    const topNames = withDebt.slice(0, 3).map((r: any) => slugify(findString(r, FIELD_NAME, mC?.name) || 'cliente')).join('_');
    const alertKey = `cliente_deuda_pendiente_${withDebt.length}_${topNames}`;
    alerts.push({
      id: alertKey,
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
    const status = findString(r, ['estado', 'status'], mG?.status).toLowerCase();
    return status === 'vencido' || status === 'overdue';
  });
  if (overdue.length > 0) {
    const alertKey = `gastos_pagos_vencidos_${overdue.length}`;
    alerts.push({
      id: alertKey,
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
  const { data: extractedData, mappings, hasData, loading } = useExtractedData();
  const { profile } = useAuth();
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());
  const [loadingStates, setLoadingStates] = useState(true);

  const companyId = profile?.company_id;

  // Load persisted read states
  useEffect(() => {
    if (!companyId) { setLoadingStates(false); return; }
    (async () => {
      const { data: rows } = await supabase
        .from('alert_states')
        .select('alert_key')
        .eq('company_id', companyId)
        .eq('is_read', true);
      if (rows) setReadKeys(new Set(rows.map(r => r.alert_key)));
      setLoadingStates(false);
    })();
  }, [companyId]);

  const persistRead = useCallback(async (keys: string[]) => {
    if (!companyId || keys.length === 0) return;
    for (const key of keys) {
      await supabase.from('alert_states').upsert(
        { company_id: companyId, alert_key: key, is_read: true, read_at: new Date().toISOString() },
        { onConflict: 'company_id,alert_key' }
      );
    }
  }, [companyId]);

  const baseAlerts = hasData ? buildAlertsFromData(extractedData, mappings) : [];
  const alerts = baseAlerts.map(a => ({ ...a, read: readKeys.has(a.id) }));
  const unread = alerts.filter(a => !a.read).length;

  const markRead = (id: string) => {
    setReadKeys(prev => new Set([...prev, id]));
    persistRead([id]);
  };

  const markAllRead = () => {
    const allKeys = alerts.filter(a => !a.read).map(a => a.id);
    setReadKeys(new Set([...readKeys, ...allKeys]));
    persistRead(allKeys);
  };

  if (loading || loadingStates) {
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
