import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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

export function useExtractedData() {
  const { profile } = useAuth();
  const [data, setData] = useState<AggregatedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  const fetchData = useCallback(async () => {
    if (!profile?.company_id) return;
    try {
      // Paginate to fetch ALL chunks (API default limit is 1000)
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
      const records = allRecords;

      const agg: AggregatedData = {
        ventas: [], gastos: [], stock: [], clientes: [],
        marketing: [], facturas: [], rrhh: [], otro: [],
      };

      if (records && records.length > 0) {
        for (const r of records as ExtractedRecord[]) {
          const cat = r.data_category as keyof AggregatedData;
          const json = r.extracted_json as any;
          const rows = json?.data || [];
          // Skip empty/broken chunks
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

  return { data, loading, hasData, refetch: fetchData };
}
