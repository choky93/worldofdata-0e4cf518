/**
 * FreshnessPill (5.13).
 *
 * Compact badge showing how recently a module's source data was uploaded.
 * Driven by `lastUploadDates` from useExtractedData() and the per-user
 * "stale threshold" setting (localStorage, default 30 days).
 *
 * Tone:
 *   - green  ("Al día")    days <= warnDays/3  ~ default 10
 *   - amber  ("Hace Xd")   days <= warnDays    ~ default 30
 *   - red    ("Hace Xd")   beyond warnDays
 *
 * Click handler is optional — when provided, the pill is clickable and
 * navigates to CargaDatos filtered by the relevant categories (lineage 5.14).
 */

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { daysSince, formatRelativeTime, formatDate } from '@/lib/formatters';
import { getStaleThresholdDays } from '@/lib/user-settings';

interface Props {
  /** ISO timestamp of latest upload across the relevant categories. */
  lastUpload: string | null | undefined;
  /** Override the user setting (mostly for testing). */
  warnDays?: number;
  onClick?: () => void;
  className?: string;
  /** Compact = no "actualizado" prefix, just the time ago. */
  compact?: boolean;
}

export function FreshnessPill({ lastUpload, warnDays, onClick, className, compact = false }: Props) {
  const threshold = warnDays ?? getStaleThresholdDays();
  const days = daysSince(lastUpload);

  if (days === null) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border',
          'bg-muted text-muted-foreground border-border',
          onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
          className,
        )}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
        Sin datos
      </span>
    );
  }

  const fresh = days <= Math.max(1, Math.floor(threshold / 3));
  const warn = !fresh && days <= threshold;
  const stale = !fresh && !warn;

  const tone = fresh
    ? { dot: 'bg-emerald-500', cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/25 dark:text-emerald-400' }
    : warn
    ? { dot: 'bg-amber-500', cls: 'bg-amber-500/15 text-amber-700 border-amber-500/25 dark:text-amber-400' }
    : { dot: 'bg-red-500 animate-pulse', cls: 'bg-red-500/15 text-red-700 border-red-500/25 dark:text-red-400' };

  const label = fresh ? (compact ? 'Hoy' : 'Al día') : formatRelativeTime(lastUpload);

  const pill = (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap',
        tone.cls,
        onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', tone.dot)} />
      {label}
    </span>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-0.5">
            <div className="font-medium">
              {stale ? 'Datos desactualizados' : warn ? 'Datos por actualizar' : 'Datos al día'}
            </div>
            <div className="text-muted-foreground">
              Última carga: {lastUpload ? formatDate(lastUpload) : '—'} ({days}d)
            </div>
            {onClick && <div className="text-muted-foreground">Click para ver origen</div>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
