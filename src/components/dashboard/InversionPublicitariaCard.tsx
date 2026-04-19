import { Megaphone } from 'lucide-react';
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters';

interface InversionPublicitariaCardProps {
  metaSpend: number;
  metaBudget: number;
  googleSpend: number;
  googleBudget: number;
}

export function InversionPublicitariaCard({
  metaSpend, metaBudget, googleSpend, googleBudget,
}: InversionPublicitariaCardProps) {
  const total = metaSpend + googleSpend;
  const hasData = total > 0;

  return (
    <div className="rounded-3xl bg-card border border-border p-6 shadow-soft hover:shadow-card-hover transition-shadow h-full min-h-[240px] flex flex-col">
      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
        Inversión publicitaria
      </p>

      {!hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Megaphone className="w-8 h-8 opacity-40" strokeWidth={1.5} />
          <span className="text-xs">Sin inversión registrada</span>
        </div>
      ) : (
        <>
          <h3
            className="font-bold text-foreground tracking-tight mb-5 truncate"
            style={{ fontSize: 'clamp(16px, 2.4vw, 26px)' }}
            title={formatCurrency(total)}
          >
            {formatCurrencyCompact(total)}
          </h3>
          <div className="space-y-4 mt-auto">
            {(metaSpend > 0 || metaBudget > 0) && (
              <Bar label="Meta Ads" spend={metaSpend} budget={metaBudget} color="hsl(var(--pastel-pink-strong))" />
            )}
            {(googleSpend > 0 || googleBudget > 0) && (
              <Bar label="Google Ads" spend={googleSpend} budget={googleBudget} color="hsl(var(--pastel-sky-strong))" />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Bar({ label, spend, budget, color }: { label: string; spend: number; budget: number; color: string }) {
  const pct = budget > 0 ? Math.min((spend / budget) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-foreground font-medium">{label}</span>
        <span className="text-muted-foreground font-mono">
          {formatCurrency(spend)}{budget > 0 && ` / ${formatCurrency(budget)}`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
