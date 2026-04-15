// src/components/ui/KPICard.tsx
// Drop-in replacement — preserva todas las props existentes

import React from 'react';

interface KPICardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: number;        // porcentaje, ej: 12.4 o -3.2
  accent?: boolean;      // card destacada en lima
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

function TrendBadge({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        fontSize: '11px',
        fontWeight: 500,
        fontFamily: 'var(--font-mono)',
        padding: '2px 7px',
        borderRadius: '99px',
        background: up ? 'var(--positive-dim)' : 'var(--negative-dim)',
        color: up ? 'var(--positive)' : 'var(--negative)',
      }}
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
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 22px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        userSelect: 'none',

        /* Accent vs normal */
        background: accent
          ? 'linear-gradient(135deg, #d4f73a 0%, #b8e020 100%)'
          : 'var(--bg-card)',
        border: accent
          ? 'none'
          : '1px solid var(--border-default)',
        boxShadow: accent
          ? 'var(--shadow-accent)'
          : 'var(--shadow-card)',
        color: accent ? '#0d0d0d' : 'var(--text-primary)',
      }}
      onMouseEnter={e => {
        if (!onClick) return;
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = accent
          ? '0 0 32px var(--accent-glow)'
          : '0 4px 24px rgba(0,0,0,0.4), 0 1px 0 var(--border-default)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = accent
          ? 'var(--shadow-accent)'
          : 'var(--shadow-card)';
      }}
    >
      {/* Decorative corner dot */}
      {accent && (
        <div style={{
          position: 'absolute', top: 14, right: 14,
          width: 8, height: 8, borderRadius: '50%',
          background: 'rgba(0,0,0,0.25)',
        }} />
      )}

      {/* Label row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '10px',
      }}>
        <span style={{
          fontSize: '11px',
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: accent ? 0.6 : undefined,
          color: accent ? undefined : 'var(--text-secondary)',
        }}>
          {label}
        </span>
        {icon && (
          <span style={{ opacity: 0.4, fontSize: '14px' }}>{icon}</span>
        )}
      </div>

      {/* Value */}
      <div style={{
        fontSize: '28px',
        fontWeight: 600,
        letterSpacing: '-0.03em',
        fontFamily: 'var(--font-sans)',
        lineHeight: 1,
        marginBottom: trend !== undefined || subtext ? '10px' : 0,
        animation: 'count-in 0.35s ease forwards',
        color: accent ? '#0d0d0d' : 'var(--text-primary)',
      }}>
        {value}
      </div>

      {/* Footer row */}
      {(trend !== undefined || subtext) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          {trend !== undefined && !accent && <TrendBadge value={trend} />}
          {subtext && (
            <span style={{
              fontSize: '12px',
              color: accent ? 'rgba(0,0,0,0.55)' : 'var(--text-secondary)',
            }}>
              {subtext}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default KPICard;
