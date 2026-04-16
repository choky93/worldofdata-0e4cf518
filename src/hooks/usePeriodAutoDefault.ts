import { useEffect } from 'react';
import { useExtractedData } from '@/hooks/useExtractedData';
import { usePeriod } from '@/contexts/PeriodContext';

export function usePeriodAutoDefault() {
  const { availableMonths } = useExtractedData();
  const { period, setPeriod } = usePeriod();

  useEffect(() => {
    if (availableMonths.length > 0 && period === 'all') {
      setPeriod(availableMonths[availableMonths.length - 1]);
    }
  }, [availableMonths]);
}
