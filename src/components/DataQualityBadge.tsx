import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { DataQualityScore } from '@/lib/data-quality';

interface Props {
  dq: DataQualityScore;
  compact?: boolean;
}

/**
 * Visual badge for the Data Quality Score (5.2). Click/hover reveals the
 * sub-scores so the user understands WHY a file is flagged.
 *
 * Color thresholds:
 *   - >= 80 green  (looks clean)
 *   - 60-79 amber  (some issues, usable)
 *   - < 60   red   (likely needs reprocessing or manual fix)
 */
export function DataQualityBadge({ dq, compact = false }: Props) {
  const tone = dq.score >= 80 ? 'good' : dq.score >= 60 ? 'warn' : 'bad';
  const Icon = tone === 'good' ? ShieldCheck : tone === 'warn' ? Shield : ShieldAlert;
  // Semantic tokens (--success, --warning, --destructive) — defined in src/index.css.
  const className = tone === 'good'
    ? 'bg-success/10 text-success border-success/20'
    : tone === 'warn'
    ? 'bg-warning/10 text-warning border-warning/20'
    : 'bg-destructive/10 text-destructive border-destructive/20';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1 font-mono ${className}`}>
            <Icon className="h-3 w-3" />
            {compact ? dq.score : `DQ ${dq.score}`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1.5 text-xs">
            <div className="font-semibold">Data Quality Score: {dq.score}/100</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <span className="text-muted-foreground">Completitud</span>
              <span className="font-mono text-right">{(dq.completeness * 100).toFixed(0)}%</span>
              <span className="text-muted-foreground">Validez</span>
              <span className="font-mono text-right">{(dq.validity * 100).toFixed(0)}%</span>
              <span className="text-muted-foreground">Unicidad</span>
              <span className="font-mono text-right">{(dq.uniqueness * 100).toFixed(0)}%</span>
              <span className="text-muted-foreground">Consistencia</span>
              <span className="font-mono text-right">{(dq.consistency * 100).toFixed(0)}%</span>
            </div>
            {dq.issues.length > 0 && (
              <div className="pt-1 border-t border-border/50">
                <div className="font-semibold text-[11px]">Issues:</div>
                <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
                  {dq.issues.slice(0, 3).map((i, idx) => <li key={idx}>{i}</li>)}
                </ul>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
