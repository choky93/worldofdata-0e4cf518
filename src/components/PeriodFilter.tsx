import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import type { PeriodKey } from '@/lib/data-cleaning';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

function getQuarter(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

interface PeriodFilterProps {
  value: PeriodKey;
  onChange: (value: PeriodKey) => void;
  availableMonths?: string[]; // ["2023-11", "2023-12", ...]
}

export function PeriodFilter({ value, onChange, availableMonths = [] }: PeriodFilterProps) {
  const { quarters, years } = useMemo(() => {
    const qSet = new Set<string>();
    const ySet = new Set<string>();
    for (const ym of availableMonths) {
      const [y, m] = ym.split('-');
      const q = getQuarter(parseInt(m));
      qSet.add(`${y}-Q${q}`);
      ySet.add(y);
    }
    return {
      quarters: Array.from(qSet).sort(),
      years: Array.from(ySet).sort(),
    };
  }, [availableMonths]);

  // Build display label for selected value
  const displayLabel = useMemo(() => {
    if (value === 'all') return 'Todo el período';
    if (/^\d{4}-\d{2}$/.test(value)) return formatMonth(value);
    if (/^\d{4}-Q[1-4]$/.test(value)) {
      const y = value.slice(0, 4);
      const q = value.slice(6);
      return `T${q} ${y}`;
    }
    if (/^\d{4}$/.test(value)) return value;
    return value;
  }, [value]);

  return (
    <div className="flex items-center gap-1.5">
      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={value} onValueChange={(v) => onChange(v as PeriodKey)}>
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue>{displayLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="all" className="text-xs font-medium">
            Todo el período
          </SelectItem>

          {availableMonths.length > 0 && (
            <>
              <SelectSeparator />

              {/* Years */}
              {years.length > 1 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Año</SelectLabel>
                  {years.map(y => (
                    <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>
                  ))}
                </SelectGroup>
              )}

              {/* Quarters */}
              {quarters.length > 1 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Trimestre</SelectLabel>
                  {quarters.map(q => {
                    const y = q.slice(0, 4);
                    const qn = q.slice(6);
                    return (
                      <SelectItem key={q} value={q} className="text-xs">
                        T{qn} {y}
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              )}

              {/* Months */}
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Mes</SelectLabel>
                {availableMonths.map(ym => (
                  <SelectItem key={ym} value={ym} className="text-xs">
                    {formatMonth(ym)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
