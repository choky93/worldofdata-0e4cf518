/**
 * HelpTooltip (Ola 18).
 *
 * Pequeño icono ⓘ que muestra una explicación en hover/focus.
 * Diseñado para insertar al lado de labels de KPIs, headers de columnas
 * y cualquier término que pueda no ser obvio para el usuario.
 *
 * Uso:
 *   <HelpTooltip content="ROAS = Ingresos / Gasto en publicidad" />
 *   <HelpTooltip content={<><strong>DQ Score</strong>: ...</>} side="left" />
 */

import * as React from 'react';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  content: React.ReactNode;
  /** Posición del popover. Default: top. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Tamaño del icono. Default: 'sm' (12px). */
  size?: 'xs' | 'sm' | 'md';
  /** Color del icono. Default: muted. */
  tone?: 'muted' | 'foreground';
  className?: string;
  /** Texto accesible para screen readers (default: "Ayuda"). */
  label?: string;
}

const SIZES = {
  xs: 'h-2.5 w-2.5',
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
};

export function HelpTooltip({
  content,
  side = 'top',
  size = 'sm',
  tone = 'muted',
  className,
  label = 'Ayuda',
}: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              'inline-flex items-center justify-center rounded-full hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tone === 'muted' ? 'text-muted-foreground' : 'text-foreground',
              className,
            )}
          >
            <HelpCircle className={SIZES[size]} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs text-xs">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
