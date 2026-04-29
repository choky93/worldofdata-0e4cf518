import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Shield, ShieldAlert, ShieldCheck, FileCheck } from 'lucide-react';
import type { DataQualityScore } from '@/lib/data-quality';

interface Props {
  dq: DataQualityScore;
  compact?: boolean;
}

/**
 * Visual badge for the Data Quality Score (5.2 / Ola 10).
 *
 * IMPORTANTE — qué mide y qué NO mide:
 *   El score NO indica "qué porcentaje del archivo se leyó". Si el archivo
 *   se procesó, leemos el 100% de las filas. El score mide la CALIDAD
 *   intrínseca de esos datos (filas vacías, duplicados, fechas mal escritas).
 *
 *   Por eso el tooltip ahora muestra explícitamente "📄 Leímos 100% del
 *   archivo" cuando hay 1+ fila — para que el cliente no confunda DQ < 100
 *   con "se perdieron datos" (feedback Lucas, tanda 1).
 *
 * Color thresholds:
 *   - >= 80 green  (datos limpios)
 *   - 60-79 amber  (algunos problemas, usable)
 *   - < 60   red   (probablemente requiere reprocesar o limpieza manual)
 */
export function DataQualityBadge({ dq, compact = false }: Props) {
  const tone = dq.score >= 80 ? 'good' : dq.score >= 60 ? 'warn' : 'bad';
  const Icon = tone === 'good' ? ShieldCheck : tone === 'warn' ? Shield : ShieldAlert;
  const toneLabel = tone === 'good' ? 'Buena' : tone === 'warn' ? 'Aceptable' : 'Revisar';
  // Semantic tokens (--success, --warning, --destructive).
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
            {compact ? dq.score : `Calidad ${dq.score}`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm">
          <div className="space-y-2 text-xs">
            <div className="font-semibold">Calidad de datos: {dq.score}/100 ({toneLabel})</div>

            {dq.rowCount > 0 && (
              <div className="flex items-center gap-1.5 text-success bg-success/10 rounded px-2 py-1">
                <FileCheck className="h-3 w-3 shrink-0" />
                <span className="text-[11px]">
                  Leímos el 100% del archivo ({dq.rowCount.toLocaleString('es-AR')} filas).
                </span>
              </div>
            )}

            <div className="text-[11px] text-muted-foreground border-t border-border/50 pt-1.5">
              El puntaje mide la calidad de los datos cargados (no cuánto se leyó):
            </div>

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
                <div className="font-semibold text-[11px]">Detalles a revisar:</div>
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
