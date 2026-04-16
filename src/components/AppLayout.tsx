import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AICopilot } from '@/components/AICopilot';
import { ExtractedDataProvider } from '@/hooks/useExtractedData';
import { usePeriodAutoDefault } from '@/hooks/usePeriodAutoDefault';

function AppLayoutInner({ children }: { children: ReactNode }) {
  usePeriodAutoDefault();
  return (
    <ExtractedDataProvider>
      <SidebarProvider defaultOpen={false}>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-12 flex items-center bg-background px-4 gap-4 shrink-0 border-b border-[#1f1f1f]">
              <SidebarTrigger />
            </header>
            <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
              {children}
            </main>
          </div>
        </div>
        <AICopilot />
      </SidebarProvider>
    </ExtractedDataProvider>
  );
}
