/**
 * PeriodSelector (Ola 11).
 *
 * Reemplazo del PeriodPills "chorizo" por un selector compacto con:
 *   - Botón principal que muestra el período activo y abre un dropdown.
 *   - Presets rápidos (últimos 7/30/90/365 días, este mes, año actual, todo).
 *   - Lista de meses/años disponibles (cuando hay datos).
 *   - Picker custom con calendario de rango (DayPicker mode="range").
 *
 * El valor `period` se sincroniza con `usePeriod()`. Soporta los formatos
 * extendidos de filterByPeriod (ver data-cleaning.ts).
 */

import * as React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { Calendar as CalendarIcon, ChevronDown, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { PeriodKey } from '@/lib/data-cleaning';

interface Props {
  value: PeriodKey;
  onChange: (val: PeriodKey) => void;
  /** Lista de meses con datos (formato YYYY-MM). Si está vacía, ocultamos esa sección. */
  availableMonths?: string[];
  className?: string;
}

const PRESETS: { key: PeriodKey; label: string }[] = [
  { key: 'all', label: 'Todo el período' },
  { key: 'last_7_days', label: 'Últimos 7 días' },
  { key: 'last_30_days', label: 'Últimos 30 días' },
  { key: 'last_90_days', label: 'Últimos 3 meses' },
  { key: 'last_365_days', label: 'Últimos 12 meses' },
  { key: 'this_month', label: 'Este mes' },
  { key: 'last_month', label: 'Mes pasado' },
];

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

function formatPeriodLabel(p: PeriodKey, fallbackToKey = true): string {
  if (p === 'all') return 'Todo el período';
  if (p === 'this_month') return 'Este mes';
  if (p === 'last_month') return 'Mes pasado';
  if (p === 'last_3_months') return 'Últimos 3 meses';
  const ldays = p.match(/^last_(\d+)_days$/);
  if (ldays) {
    const n = parseInt(ldays[1], 10);
    if (n === 7) return 'Últimos 7 días';
    if (n === 30) return 'Últimos 30 días';
    if (n === 90) return 'Últimos 3 meses';
    if (n === 365) return 'Últimos 12 meses';
    return `Últimos ${n} días`;
  }
  const custom = p.match(/^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
  if (custom) {
    const f = new Date(custom[1] + 'T00:00:00');
    const t = new Date(custom[2] + 'T00:00:00');
    return `${format(f, 'd MMM yy', { locale: es })} – ${format(t, 'd MMM yy', { locale: es })}`;
  }
  if (/^\d{4}-Q[1-4]$/.test(p)) return `T${p.slice(6)} ${p.slice(0, 4)}`;
  if (/^\d{4}-\d{2}$/.test(p)) {
    const [y, m] = p.split('-');
    return `${MONTH_NAMES[parseInt(m) - 1]} ${y.slice(2)}`;
  }
  if (/^\d{4}$/.test(p)) return p;
  return fallbackToKey ? p : '—';
}

export function PeriodSelector({ value, onChange, availableMonths = [], className }: Props) {
  const [open, setOpen] = React.useState(false);
  const [showCustom, setShowCustom] = React.useState(false);
  const [customRange, setCustomRange] = React.useState<DateRange | undefined>(() => {
    const m = value.match(/^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
    if (m) return { from: new Date(m[1] + 'T00:00:00'), to: new Date(m[2] + 'T00:00:00') };
    return undefined;
  });

  const years = React.useMemo(
    () => [...new Set(availableMonths.map(m => m.split('-')[0]))].sort().reverse(),
    [availableMonths],
  );
  const recentMonths = React.useMemo(
    () => [...availableMonths].sort().reverse().slice(0, 6),
    [availableMonths],
  );

  const handlePreset = (p: PeriodKey) => {
    onChange(p);
    setShowCustom(false);
    setOpen(false);
  };

  const applyCustom = () => {
    if (!customRange?.from || !customRange?.to) return;
    const f = format(customRange.from, 'yyyy-MM-dd');
    const t = format(customRange.to, 'yyyy-MM-dd');
    onChange(`custom:${f}:${t}`);
    setShowCustom(false);
    setOpen(false);
  };

  const isCustom = value.startsWith('custom:');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-2 font-medium', className)}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          <span>{formatPeriodLabel(value)}</span>
          {value !== 'all' && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange('all'); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange('all'); } }}
              className="ml-1 rounded p-0.5 hover:bg-muted-foreground/10 transition-colors"
              aria-label="Limpiar filtro de período"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        {!showCustom ? (
          <div className="flex flex-col">
            {/* Presets */}
            <div className="p-2 border-b">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1">Rápidos</p>
              {PRESETS.map(p => (
                <button
                  key={String(p.key)}
                  onClick={() => handlePreset(p.key)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors',
                    value === p.key && 'bg-muted font-medium',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Años / meses con datos */}
            {(years.length > 0 || recentMonths.length > 0) && (
              <div className="p-2 border-b max-h-52 overflow-y-auto">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1">Con datos</p>
                {years.map(y => (
                  <button
                    key={y}
                    onClick={() => handlePreset(y)}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors',
                      value === y && 'bg-muted font-medium',
                    )}
                  >
                    Año {y}
                  </button>
                ))}
                {recentMonths.length > 0 && <div className="h-1" />}
                {recentMonths.map(ym => (
                  <button
                    key={ym}
                    onClick={() => handlePreset(ym)}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors',
                      value === ym && 'bg-muted font-medium',
                    )}
                  >
                    {formatPeriodLabel(ym)}
                  </button>
                ))}
              </div>
            )}

            {/* Custom range */}
            <div className="p-2">
              <button
                onClick={() => setShowCustom(true)}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors flex items-center gap-2',
                  isCustom && 'bg-muted font-medium',
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                Rango personalizado…
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            <div className="flex items-center justify-between px-2">
              <p className="text-xs font-semibold">Elegí el rango</p>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowCustom(false)}>
                ← Volver
              </Button>
            </div>
            <Calendar
              mode="range"
              selected={customRange}
              onSelect={setCustomRange}
              numberOfMonths={1}
              locale={es}
              defaultMonth={customRange?.from ?? new Date()}
            />
            <div className="flex items-center justify-between gap-2 px-2 pb-1">
              <span className="text-xs text-muted-foreground">
                {customRange?.from && customRange?.to
                  ? `${format(customRange.from, 'd MMM', { locale: es })} – ${format(customRange.to, 'd MMM yy', { locale: es })}`
                  : 'Seleccioná desde y hasta'}
              </span>
              <Button
                size="sm"
                onClick={applyCustom}
                disabled={!customRange?.from || !customRange?.to}
                className="h-7 text-xs"
              >
                Aplicar
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
