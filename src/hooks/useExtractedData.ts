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
      const { data: records, error } = await supabase
        .from('file_extracted_data')
        .select('data_category, extracted_json, row_count, summary, chunk_index, file_upload_id')
        .eq('company_id', profile.company_id)
        .neq('data_category', '_raw_cache')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const agg: AggregatedData = {
        ventas: [], gastos: [], stock: [], clientes: [],
        marketing: [], facturas: [], rrhh: [], otro: [],
      };

      if (records && records.length > 0) {
        for (const r of records as ExtractedRecord[]) {
          const cat = r.data_category as keyof AggregatedData;
          const json = r.extracted_json as any;
          const rows = json?.data || [];
          if (agg[cat]) {
            agg[cat].push(...(Array.isArray(rows) ? rows : []));
          } else {
            agg.otro.push(...(Array.isArray(rows) ? rows : []));
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
