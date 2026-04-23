import { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { AICopilot } from '@/components/AICopilot';
import { ExtractedDataProvider } from '@/hooks/useExtractedData';
import { usePeriodAutoDefault } from '@/hooks/usePeriodAutoDefault';
import { SidebarProvider, useAppSidebar } from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';

function PeriodAutoSetter() {
  usePeriodAutoDefault();
  return null;
}

function LayoutInner({ children }: { children: ReactNode }) {
  const { expanded, toggle } = useAppSidebar();
  return (
    <div className="min-h-screen w-full bg-background">
      <AppSidebar />
      {/* Mobile backdrop — closes sidebar when tapping outside */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/30 z-30 sm:hidden"
          onClick={toggle}
          aria-hidden="true"
        />
      )}
      {/* Main content — no margin on mobile (sidebar overlays), fixed margin on desktop */}
      <div className={cn(
        'min-h-screen flex flex-col transition-all duration-300',
        'ml-0 sm:ml-[72px]',
        expanded ? 'sm:ml-[240px]' : 'sm:ml-[72px]',
      )}>
        {/* Mobile top bar — hamburger to open sidebar, hidden on sm+ */}
        <div className="sm:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-background/95 backdrop-blur border-b border-border">
          <button
            onClick={toggle}
            aria-label="Abrir menú"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Menu className="h-5 w-5" strokeWidth={2} />
          </button>
          <span className="text-sm font-semibold text-foreground tracking-tight">World of Data</span>
        </div>
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      <AICopilot />
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ExtractedDataProvider>
      <PeriodAutoSetter />
      <SidebarProvider>
        <LayoutInner>{children}</LayoutInner>
      </SidebarProvider>
    </ExtractedDataProvider>
  );
}
