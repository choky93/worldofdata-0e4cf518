import {
  LayoutDashboard, ShoppingCart, Wallet, Package, Users, TrendingUp,
  Bell, BarChart3, Megaphone, FileBox, Upload, UserCog, Settings, LogOut,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { APP_NAME } from '@/lib/constants';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = !isMobile && state === 'collapsed';

  const items = role === 'employee' ? employeeItems : adminItems;

  const visibleItems = items.filter((item) => {
    if (!('conditional' in item) || !item.conditional) return true;
    if (!companySettings) return true;
    if (item.conditional === 'has_stock') return companySettings.has_stock || companySettings.sells_products;
    if (item.conditional === 'has_ads') return companySettings.uses_meta_ads || companySettings.uses_google_ads;
    return true;
  });

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <div className="sidebar-gradient h-full flex flex-col">
        <SidebarHeader className="p-4">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
                <BarChart3 className="h-4.5 w-4.5 text-primary-foreground" />
              </div>
              <span className="font-bold text-sm text-sidebar-foreground tracking-tight">{APP_NAME}</span>
            </div>
          )}
          {collapsed && (
            <div className="flex justify-center">
              <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
                <BarChart3 className="h-4.5 w-4.5 text-primary-foreground" />
              </div>
            </div>
          )}
        </SidebarHeader>

        <SidebarContent className="px-2">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === '/'}
                        className="hover:bg-sidebar-accent/60 rounded-lg transition-all duration-200"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold shadow-sm"
                        onClick={() => isMobile && setOpenMobile(false)}
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                        {!collapsed && 'badge' in item && item.badge && (
                          <Badge variant="destructive" className="ml-auto h-5 min-w-5 text-xs font-semibold">
                            {String(item.badge)}
                          </Badge>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-2">
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {!collapsed && <span>Cerrar sesión</span>}
          </Button>
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}
