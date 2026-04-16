import {
  LayoutDashboard, ShoppingCart, Wallet, Package, Users, TrendingUp,
  Bell, BarChart3, Megaphone, FileBox, Upload, UserCog, Settings, LogOut,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useExtractedData } from '@/hooks/useExtractedData';
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

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="fixed left-0 top-0 h-screen w-[72px] bg-card border-r border-border flex flex-col items-center py-5 z-40">
        {/* Logo */}
        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center mb-6 shrink-0">
          <span className="text-accent-foreground font-bold text-sm tracking-tight">WD</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1.5 flex-1 overflow-y-auto overflow-x-hidden w-full items-center px-2">
          {visibleItems.map((item) => (
            <Tooltip key={item.title}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.url}
                  end={item.url === '/'}
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200",
                    "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                  activeClassName="!bg-accent !text-accent-foreground hover:!bg-accent hover:!text-accent-foreground"
                >
                  <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                {item.title}
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>

        {/* Logout */}
        <div className="pt-2 mt-2 border-t border-border w-full flex justify-center">
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
        </div>
      </aside>
    </TooltipProvider>
  );
}
