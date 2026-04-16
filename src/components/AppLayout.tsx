import { ReactNode } from 'react';
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
  const { expanded } = useAppSidebar();
  return (
    <div className="min-h-screen w-full bg-background">
      <AppSidebar />
      <div className={cn('min-h-screen flex flex-col transition-all duration-300', expanded ? 'ml-[240px]' : 'ml-[72px]')}>
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
