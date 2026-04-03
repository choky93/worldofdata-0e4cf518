import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import type { PeriodKey } from '@/lib/data-cleaning';

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'all', label: 'Todo el período' },
  { value: 'this_month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes pasado' },
  { value: 'last_3_months', label: 'Últimos 3 meses' },
];

interface PeriodFilterProps {
  value: PeriodKey;
  onChange: (value: PeriodKey) => void;
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={value} onValueChange={(v) => onChange(v as PeriodKey)}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map(opt => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
