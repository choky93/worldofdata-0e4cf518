import { Calendar, Filter } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

interface PeriodOption {
  label: string;
  value: string;
}

interface TopbarProps {
  userName?: string;
  pageTitle?: string;
  breadcrumb?: string;
  currentPeriod?: string;
  onPeriodChange?: (period: string) => void;
  availablePeriods?: PeriodOption[];
}

export function Topbar({
  userName = 'Usuario',
  pageTitle = 'Dashboard',
  breadcrumb = 'Inicio',
  currentPeriod,
  onPeriodChange,
  availablePeriods = [],
}: TopbarProps) {
  const hoy = new Date().toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <header className="flex items-center justify-between mb-8 flex-wrap gap-4">
      <div>
        <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
          <span>{breadcrumb}</span>
          <span>→</span>
          <span>{pageTitle}</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
          Hola, {userName}
        </h1>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {availablePeriods.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Filtrar por período"
                className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-secondary transition-colors"
              >
                <Filter className="w-4 h-4" strokeWidth={2} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Filtrar por período</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availablePeriods.map((p) => (
                <DropdownMenuItem
                  key={p.value}
                  onClick={() => onPeriodChange?.(p.value)}
                  className={currentPeriod === p.value ? 'bg-secondary font-medium' : ''}
                >
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <button className="h-10 px-4 rounded-full bg-card border border-border flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4" strokeWidth={2} />
          <span>{hoy}</span>
        </button>
      </div>
    </header>
  );
}
