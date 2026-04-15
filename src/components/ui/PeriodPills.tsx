// src/components/ui/PeriodPills.tsx
// Reemplaza el PeriodFilter actual con este diseño premium

import React from 'react';

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

  // Mostrar: Todo + últimos 3 años + últimos 3 meses disponibles
  const recentMonths = [...availableMonths].sort().reverse().slice(0, 3);

  const pills = [
    'all',
    ...years.slice(0, 3),
    ...recentMonths,
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      flexWrap: 'wrap',
    }}>
      {pills.map(pill => {
        const active = value === pill;
        return (
          <button
            key={pill}
            onClick={() => onChange(pill)}
            style={{
              padding: '5px 12px',
              borderRadius: '99px',
              fontSize: '12px',
              fontWeight: active ? 600 : 400,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              transition: 'all 0.12s ease',
              border: active ? 'none' : '1px solid var(--border-default)',
              background: active ? '#c8f135' : 'transparent',
              color: active ? '#0d0d0d' : 'var(--text-secondary)',
              letterSpacing: active ? '-0.01em' : '0',
              boxShadow: active ? 'var(--shadow-accent)' : 'none',
              outline: 'none',
            }}
            onMouseEnter={e => {
              if (!active) {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-raised)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
              }
            }}
          >
            {formatLabel(pill)}
          </button>
        );
      })}
    </div>
  );
}

export default PeriodPills;
