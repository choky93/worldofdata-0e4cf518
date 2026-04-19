// src/components/ui/KPICard.tsx
// Light pastel theme — drop-in replacement, misma API de props
import React from 'react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: number;
  accent?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

function TrendBadge({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums px-2 py-0.5 rounded-full',
        up ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
      )}
    >
      {up ? '↑' : '↓'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function KPICard({
  label,
  value,
  subtext,
  trend,
  accent = false,
  icon,
  onClick,
  className = '',
}: KPICardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-2xl p-5 transition-all duration-150 select-none',
        accent
          ? 'bg-accent text-accent-foreground shadow-card'
          : 'bg-card text-card-foreground border border-border shadow-card',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-card-hover',
        className,
      )}
    >
      {accent && (
        <div className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-white/30" />
      )}

      <div className="flex items-center justify-between mb-2.5">
        <span
          className={cn(
            'text-[11px] font-medium uppercase tracking-widest',
            accent ? 'text-accent-foreground/60' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        {icon && (
          <span className={cn('text-sm', accent ? 'opacity-50' : 'text-muted-foreground/60')}>
            {icon}
          </span>
        )}
      </div>

      <div
        className={cn(
          'font-semibold leading-none tracking-tight tabular-nums truncate',
          (trend !== undefined || subtext) && 'mb-2.5',
        )}
        style={{ fontSize: 'clamp(14px, 2.2vw, 28px)' }}
        title={value !== undefined && value !== null ? String(value) : undefined}
      >
        {value}
      </div>

      {(trend !== undefined || subtext) && (
        <div className="flex items-center gap-2 flex-wrap">
          {trend !== undefined && !accent && <TrendBadge value={trend} />}
          {subtext && (
            <span
              className={cn(
                'text-xs',
                accent ? 'text-accent-foreground/65' : 'text-muted-foreground',
              )}
            >
              {subtext}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default KPICard;
