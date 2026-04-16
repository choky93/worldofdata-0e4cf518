import { formatCurrency } from '@/lib/formatters';
import { Wallet } from 'lucide-react';

interface FlujoCajaCardProps {
  ingresos: number | null;
  egresos: number | null;
}

export function FlujoCajaCard({ ingresos, egresos }: FlujoCajaCardProps) {
  const flujo = (ingresos ?? 0) - (egresos ?? 0);
  return (
    <div
      className="rounded-3xl p-6 shadow-soft hover:shadow-card-hover transition-shadow h-full min-h-[260px] flex flex-col justify-between border border-border"
      style={{
        background: 'linear-gradient(135deg, hsl(var(--pastel-mint)) 0%, hsl(var(--pastel-sky)) 100%)',
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-foreground/70 font-medium">
          Flujo de caja
        </p>
        <Wallet className="w-4 h-4 text-foreground/60" />
      </div>

      <div>
        <h3 className="text-3xl font-bold text-foreground tracking-tight">
          {ingresos !== null || egresos !== null ? formatCurrency(flujo) : '—'}
        </h3>
        <div className="mt-3 space-y-1 text-xs text-foreground/70">
          <div className="flex justify-between">
            <span>Ingresos</span>
            <span className="font-mono font-semibold">
              {ingresos !== null ? formatCurrency(ingresos) : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Egresos</span>
            <span className="font-mono font-semibold">
              {egresos !== null ? formatCurrency(egresos) : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
