import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PeriodKey } from '@/lib/data-cleaning';

interface PeriodContextValue {
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
}

const PeriodContext = createContext<PeriodContextValue | undefined>(undefined);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<PeriodKey>('all');
  return (
    <PeriodContext.Provider value={{ period, setPeriod }}>
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriod(): PeriodContextValue {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error('usePeriod must be used within PeriodProvider');
  return ctx;
}
