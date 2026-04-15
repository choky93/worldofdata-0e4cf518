import { useState, useEffect, useCallback, useMemo, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ColumnMapping } from '@/lib/field-utils';
import { findString, FIELD_DATE } from '@/lib/field-utils';
import { extractAvailableMonths, detectMultiSourcePeriods } from '@/lib/data-cleaning';

interface ExtractedRecord {
  data_category: string;
  extracted_json: any;
  row_count: number | null;
  summary: string | null;
  chunk_index: number;
  file_upload_id: string;
}

interface AggregatedData {
  ventas: any[];
  gastos: any[];
  stock: any[];
  clientes: any[];
  marketing: any[];
  facturas: any[];
  rrhh: any[];
  otro: any[];
}

// Merged column mappings per category
export interface CategoryMappings {
  ventas: ColumnMapping;
  gastos: ColumnMapping;
  stock: ColumnMapping;
  clientes: ColumnMapping;
  marketing: ColumnMapping;
  facturas: ColumnMapping;
  rrhh: ColumnMapping;
  otro: ColumnMapping;
}

interface ExtractedDataContextValue {
  data: AggregatedData | null;
  mappings: CategoryMappings;
  loading: boolean;
  hasData: boolean;
  availableMonths: string[];
  refetch: () => Promise<void>;
}

const defaultMappings: CategoryMappings = {
  ventas: {}, gastos: {}, stock: {}, clientes: {},
  marketing: {}, facturas: {}, rrhh: {}, otro: {},
};

const ExtractedDataContext = createContext<ExtractedDataContextValue | undefined>(undefined);

export function ExtractedDataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [data, setData] = useState<AggregatedData | null>(null);
  const [mappings, setMappings] = useState<CategoryMappings>({ ...defaultMappings });
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  const fetchData = useCallback(async () => {
    if (!profile?.company_id) return;
    try {
      const PAGE = 1000;
      let allRecords: ExtractedRecord[] = [];
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from('file_extracted_data')
          .select('data_category, extracted_json, row_count, summary, chunk_index, file_upload_id')
          .eq('company_id', profile.company_id)
          .not('data_category', 'in', '("_raw_cache","_classification")')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);

        if (error) throw error;
        if (!page || page.length === 0) break;
        allRecords.push(...(page as ExtractedRecord[]));
        if (page.length < PAGE) break;
        from += PAGE;
      }

      const agg: AggregatedData = {
        ventas: [], gastos: [], stock: [], clientes: [],
        marketing: [], facturas: [], rrhh: [], otro: [],
      };

      const mergedMappings: CategoryMappings = {
        ventas: {}, gastos: {}, stock: {}, clientes: {},
        marketing: {}, facturas: {}, rrhh: {}, otro: {},
      };

      const dataRecords: ExtractedRecord[] = [];
      for (const r of allRecords) {
        if (r.data_category === '_column_mapping') {
          const json = r.extracted_json as any;
          const cat = json?.category as keyof CategoryMappings;
          const mapping = json?.column_mapping;
          if (cat && mapping && mergedMappings[cat]) {
            const target = mergedMappings[cat];
            for (const [k, v] of Object.entries(mapping)) {
              if (v && !target[k]) target[k] = v as string;
            }
          }
        } else {
          dataRecords.push(r);
        }
      }

      if (dataRecords.length > 0) {
        for (const r of dataRecords) {
          const cat = r.data_category as keyof AggregatedData;
          const json = r.extracted_json as any;
          const rows = json?.data || [];
          if (!Array.isArray(rows) || rows.length === 0) continue;
          if (agg[cat]) {
            agg[cat].push(...rows);
          } else {
            agg.otro.push(...rows);
          }
        }
        setHasData(true);
      } else {
        setHasData(false);
      }

      setData(agg);
      setMappings(mergedMappings);
    } catch (err) {
      console.error('useExtractedData error:', err);
      setHasData(false);
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute available months across ventas, gastos, marketing
  const availableMonths = useMemo(() => {
    if (!data) return [];
    const mV = mappings.ventas;
    const mG = mappings.gastos;
    const mM = mappings.marketing;
    const finder = (mapping?: ColumnMapping) => (row: any, kw: string[]) => findString(row, kw, mapping?.date);
    const months = new Set<string>();
    for (const m of extractAvailableMonths(data.ventas, FIELD_DATE, finder(mV))) months.add(m);
    for (const m of extractAvailableMonths(data.gastos, FIELD_DATE, finder(mG))) months.add(m);
    for (const m of extractAvailableMonths(data.marketing, FIELD_DATE, finder(mM))) months.add(m);
    return Array.from(months).sort();
  }, [data, mappings]);

  return (
    <ExtractedDataContext.Provider value={{ data, mappings, loading, hasData, availableMonths, refetch: fetchData }}>
      {children}
    </ExtractedDataContext.Provider>
  );
}

export function useExtractedData() {
  const context = useContext(ExtractedDataContext);
  if (context === undefined) {
    throw new Error('useExtractedData must be used within an ExtractedDataProvider');
  }
  return context;
}
