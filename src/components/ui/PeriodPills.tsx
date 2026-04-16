// src/components/ui/PeriodPills.tsx
// Light pastel theme — píldoras de período con tokens semánticos
import React from 'react';
import { cn } from '@/lib/utils';

interface PeriodPillsProps {
  value: string;
  onChange: (val: string) => void;
  availableMonths?: string[];
}

function formatLabel(val: string): string {
  if (val === 'all') return 'Todo el período';
  if (/^\d{4}$/.test(val)) return val;
  if (/^\d{4}-Q[1-4]$/.test(val)) {
    const [y, q] = val.split('-Q');
    return `T${q} ${y}`;
  }
  if (/^\d{4}-\d{2}$/.test(val)) {
    const [y, m] = val.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
      .replace('.', '')
      .replace(/^\w/, c => c.toUpperCase());
  }
  return val;
}

export function PeriodPills({ value, onChange, availableMonths = [] }: PeriodPillsProps) {
  const years = [...new Set(availableMonths.map(m => m.split('-')[0]))].sort().reverse();
  const recentMonths = [...availableMonths].sort().reverse().slice(0, 3);

  const pills = [
    'all',
    ...years.slice(0, 3),
    ...recentMonths,
  ];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {pills.map(pill => {
        const active = value === pill;
        return (
          <button
            key={pill}
            onClick={() => onChange(pill)}
            className={cn(
              'px-3 py-1 rounded-full text-xs transition-all duration-150 border',
              active
                ? 'bg-accent text-accent-foreground border-transparent font-semibold shadow-card'
                : 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground font-normal',
            )}
          >
            {formatLabel(pill)}
          </button>
        );
      })}
    </div>
  );
}

export default PeriodPills;
