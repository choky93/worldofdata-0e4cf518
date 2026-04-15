import { useMemo } from 'react';
import type { PeriodKey } from '@/lib/data-cleaning';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

function formatMonthShort(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m) - 1].slice(0, 3)} ${y.slice(2)}`;
}

function getQuarter(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

interface PeriodFilterProps {
  value: PeriodKey;
  onChange: (value: PeriodKey) => void;
  availableMonths?: string[];
}

export function PeriodFilter({ value, onChange, availableMonths = [] }: PeriodFilterProps) {
  const { years } = useMemo(() => {
    const ySet = new Set<string>();
    for (const ym of availableMonths) {
      const [y] = ym.split('-');
      ySet.add(y);
    }
    return { years: Array.from(ySet).sort() };
  }, [availableMonths]);

  // Build pill options
  const pills: { key: PeriodKey; label: string }[] = [
    { key: 'all', label: 'Todo el período' },
    ...years.map(y => ({ key: y as PeriodKey, label: y })),
  ];

  // Add last 3 months as individual pills if available
  const recentMonths = availableMonths.slice(-3).reverse();
  recentMonths.forEach(ym => {
    pills.push({ key: ym as PeriodKey, label: formatMonthShort(ym) });
  });

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {pills.map(pill => (
        <button
          key={pill.key}
          onClick={() => onChange(pill.key)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
            value === pill.key
              ? 'bg-primary text-primary-foreground border-transparent'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-[#3a3a3a]'
          }`}
        >
          {pill.label}
        </button>
      ))}
    </div>
  );
}
