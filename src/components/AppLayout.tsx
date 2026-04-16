import { ReactNode } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { AICopilot } from '@/components/AICopilot';
import { ExtractedDataProvider } from '@/hooks/useExtractedData';
import { usePeriodAutoDefault } from '@/hooks/usePeriodAutoDefault';

function PeriodAutoSetter() {
  usePeriodAutoDefault();
  return null;
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ExtractedDataProvider>
      <PeriodAutoSetter />
      <div className="min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="ml-[72px] min-h-screen flex flex-col">
          <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
        <AICopilot />
      </div>
    </ExtractedDataProvider>
  );
}
