import { Search, Filter, Calendar, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TopbarProps {
  userName?: string;
  pageTitle?: string;
  breadcrumb?: string;
}

export function Topbar({ userName = 'Usuario', pageTitle = 'Dashboard', breadcrumb = 'Inicio' }: TopbarProps) {
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
        <button
          aria-label="Buscar"
          className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <Search className="w-4 h-4" strokeWidth={2} />
        </button>
        <button
          aria-label="Filtrar"
          className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <Filter className="w-4 h-4" strokeWidth={2} />
        </button>
        <button className="h-10 px-4 rounded-full bg-card border border-border flex items-center gap-2 text-sm hover:bg-secondary transition-colors">
          <Calendar className="w-4 h-4" strokeWidth={2} />
          <span>{hoy}</span>
        </button>
        <Button className="h-10 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground px-5 gap-2">
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Crear Reporte
        </Button>
      </div>
    </header>
  );
}
