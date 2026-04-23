import {
  LayoutDashboard, ShoppingCart, Wallet, Package, Users, TrendingUp,
  Bell, BarChart3, Megaphone, FileBox, Upload, UserCog, Settings, LogOut,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useExtractedData } from '@/hooks/useExtractedData';
import { useAppSidebar } from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const adminItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Ventas', url: '/ventas', icon: ShoppingCart },
  { title: 'Finanzas', url: '/finanzas', icon: Wallet },
  { title: 'Stock', url: '/stock', icon: Package, conditional: 'has_stock' },
  { title: 'Clientes', url: '/clientes', icon: Users },
  { title: 'Forecast', url: '/forecast', icon: TrendingUp },
  { title: 'Alertas', url: '/alertas', icon: Bell },
  { title: 'Métricas', url: '/metricas', icon: BarChart3 },
  { title: 'Marketing', url: '/marketing', icon: Megaphone, conditional: 'has_ads' },
  { title: 'Operaciones', url: '/operaciones', icon: FileBox },
  { title: 'Carga de datos', url: '/carga-datos', icon: Upload },
  { title: 'Equipo', url: '/equipo', icon: UserCog },
  { title: 'Configuración', url: '/configuracion', icon: Settings },
];

const employeeItems = [
  { title: 'Carga de datos', url: '/carga-datos', icon: Upload },
];

export function AppSidebar() {
  const { role, companySettings, signOut } = useAuth();
  const { data: extractedData } = useExtractedData();
  const { expanded, toggle } = useAppSidebar();

  const items = role === 'employee' ? employeeItems : adminItems;

  const hasMarketingData = (extractedData?.marketing || []).length > 0;
  const hasStockData = (extractedData?.stock || []).length > 0;

  const visibleItems = items.filter((item) => {
    if (!('conditional' in item) || !item.conditional) return true;
    if (!companySettings) return true;
    if (item.conditional === 'has_stock') return companySettings.has_stock || companySettings.sells_products || hasStockData;
    if (item.conditional === 'has_ads') return companySettings.uses_meta_ads || companySettings.uses_google_ads || hasMarketingData;
    return true;
  });

  // On mobile: sidebar is always 240px wide but slides off-screen when not expanded.
  // On desktop: collapsed = 72px, expanded = 240px, always visible.
  const widthClass = expanded ? 'w-[240px]' : 'w-[240px] sm:w-[72px]';
  const translateClass = expanded ? 'translate-x-0' : '-translate-x-full sm:translate-x-0';

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen bg-card border-r border-border flex flex-col py-5 z-40 transition-all duration-300',
          widthClass,
          translateClass,
          expanded ? 'items-stretch px-3' : 'items-center'
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center mb-4 shrink-0', expanded ? 'justify-between px-1' : 'justify-center')}>
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
            <span className="text-accent-foreground font-bold text-sm tracking-tight">WD</span>
          </div>
          {expanded && (
            <span className="text-sm font-semibold text-foreground tracking-tight ml-3 flex-1">World of Data</span>
          )}
        </div>

        {/* Toggle */}
        <button
          onClick={toggle}
          className={cn(
            'h-9 rounded-xl flex items-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mb-3 shrink-0',
            expanded ? 'justify-start px-3 gap-2.5' : 'w-10 mx-auto justify-center'
          )}
          title={expanded ? 'Colapsar' : 'Expandir'}
        >
          {expanded ? (
            <>
              <PanelLeftClose className="w-4 h-4 shrink-0" strokeWidth={1.8} />
              <span className="text-xs font-medium">Colapsar</span>
            </>
          ) : (
            <PanelLeftOpen className="w-4 h-4" strokeWidth={1.8} />
          )}
        </button>

        {/* Nav */}
        <nav className={cn('flex flex-col gap-1 flex-1 overflow-y-auto overflow-x-hidden', expanded ? 'w-full' : 'w-full items-center px-2')}>
          {visibleItems.map((item) => {
            const link = (
              <NavLink
                to={item.url}
                end={item.url === '/'}
                className={cn(
                  'rounded-xl flex items-center transition-all duration-200',
                  'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  expanded ? 'h-10 w-full px-3 gap-3' : 'w-11 h-11 justify-center'
                )}
                activeClassName="!bg-accent !text-accent-foreground hover:!bg-accent hover:!text-accent-foreground"
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                {expanded && <span className="text-sm font-medium truncate">{item.title}</span>}
              </NavLink>
            );

            if (expanded) return <div key={item.title}>{link}</div>;
            return (
              <Tooltip key={item.title}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  {item.title}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Logout */}
        <div className={cn('pt-2 mt-2 border-t border-border w-full', expanded ? '' : 'flex justify-center')}>
          {expanded ? (
            <button
              onClick={signOut}
              className="h-10 w-full px-3 rounded-xl flex items-center gap-3 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-200"
            >
              <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
              <span className="text-sm font-medium">Cerrar sesión</span>
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-200"
                >
                  <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                Cerrar sesión
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
