import { useState, useEffect, useCallback, useMemo, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ColumnMapping } from '@/lib/field-utils';
import { findString, FIELD_DATE, FIELD_AMOUNT } from '@/lib/field-utils';
import { extractAvailableMonths, detectMultiSourcePeriods, detectCurrencyMix, detectCurrencies } from '@/lib/data-cleaning';

interface ExtractedRecord {
  data_category: string;
  extracted_json: any;
  row_count: number | null;
  summary: string | null;
  chunk_index: number;
  file_upload_id: string;
  created_at: string | null; // used to inject upload timestamp into stock rows for dedup
}

interface AggregatedData {
  ventas: any[];
  gastos: any[];
  stock: any[];
  clientes: any[];
  marketing: any[];
  facturas: any[];
  rrhh: any[];
  // Ola 21: oportunidades del CRM (Salesforce / HubSpot / Pipedrive / etc.)
  crm: any[];
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
  crm: ColumnMapping;
  otro: ColumnMapping;
}

export interface TaggedRow {
  row: any;
  fileUploadId: string;
}

interface ExtractedDataContextValue {
  data: AggregatedData | null;
  mappings: CategoryMappings;
  loading: boolean;
  hasData: boolean;
  availableMonths: string[];
  duplicatedPeriods: string[];
  hasCurrencyMix: { ventas: boolean; gastos: boolean };
  detectedCurrencies: { ventas: string[]; gastos: string[] };
  taggedVentasRows: TaggedRow[];
  taggedGastosRows: TaggedRow[];
  taggedMarketingRows: TaggedRow[];
  /** Timestamp ISO de la última carga activa por categoría (para indicador de frescura) */
  lastUploadDates: Record<string, string>;
  refetch: () => Promise<void>;
}

const defaultMappings: CategoryMappings = {
  ventas: {}, gastos: {}, stock: {}, clientes: {},
  marketing: {}, facturas: {}, rrhh: {}, crm: {}, otro: {},
};

const ExtractedDataContext = createContext<ExtractedDataContextValue | undefined>(undefined);

export function ExtractedDataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [data, setData] = useState<AggregatedData | null>(null);
  const [mappings, setMappings] = useState<CategoryMappings>({ ...defaultMappings });
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [taggedVentasRows, setTaggedVentasRows] = useState<{ row: any; fileUploadId: string }[]>([]);
  const [taggedGastosRows, setTaggedGastosRows] = useState<{ row: any; fileUploadId: string }[]>([]);
  const [taggedMarketingRows, setTaggedMarketingRows] = useState<{ row: any; fileUploadId: string }[]>([]);
  const [lastUploadDates, setLastUploadDates] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    if (!profile?.company_id) return;
    try {
      // C4: Get archived file IDs to exclude from dashboard calculations
      const { data: archivedFiles } = await supabase
        .from('file_uploads')
        .select('id')
        .eq('company_id', profile.company_id)
        .eq('status', 'archived');
      const archivedIds = new Set((archivedFiles || []).map(f => f.id));

      const PAGE = 1000;
      let allRecords: ExtractedRecord[] = [];
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from('file_extracted_data')
          .select('data_category, extracted_json, row_count, summary, chunk_index, file_upload_id, created_at')
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

      // C4: Exclude records from archived files
      if (archivedIds.size > 0) {
        allRecords = allRecords.filter(r => !archivedIds.has(r.file_upload_id));
      }

      const agg: AggregatedData = {
        ventas: [], gastos: [], stock: [], clientes: [],
        marketing: [], facturas: [], rrhh: [], crm: [], otro: [],
      };

      // Track rows with their source file for overlap detection
      const taggedVentas: { row: any; fileUploadId: string }[] = [];
      const taggedGastos: { row: any; fileUploadId: string }[] = [];
      const taggedMarketing: { row: any; fileUploadId: string }[] = [];

      const mergedMappings: CategoryMappings = {
        ventas: {}, gastos: {}, stock: {}, clientes: {},
        marketing: {}, facturas: {}, rrhh: {}, crm: {}, otro: {},
      };

      // Redirect legacy/orphaned categories to their correct buckets.
      // "operaciones" → gastos (compras a proveedores, logística)
      // "finanzas"    → facturas (extractos bancarios, movimientos)
      const remapCategory = (cat: string): string => {
        if (cat === 'operaciones') return 'gastos';
        if (cat === 'finanzas') return 'facturas';
        return cat;
      };

      const dataRecords: ExtractedRecord[] = [];
      for (const r of allRecords) {
        if (r.data_category === '_column_mapping') {
          const json = r.extracted_json as any;
          const rawCat = json?.category as string;
          const cat = remapCategory(rawCat) as keyof CategoryMappings;
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

      // Freshness: fecha de última carga activa por categoría
      const freshnessDates: Record<string, string> = {};

      if (dataRecords.length > 0) {
        for (const r of dataRecords) {
          const cat = remapCategory(r.data_category) as keyof AggregatedData;
          // Track most recent upload per category (records come DESC by created_at)
          if (r.created_at && (!freshnessDates[cat] || r.created_at > freshnessDates[cat])) {
            freshnessDates[cat] = r.created_at;
          }
          const json = r.extracted_json as any;
          const rows = json?.data || [];
          if (!Array.isArray(rows) || rows.length === 0) continue;
          if (agg[cat]) {
            // C3: tag stock rows with the file's upload timestamp so dedupeStockRows
            // can resolve conflicts between multiple stock files correctly.
            const processedRows = cat === 'stock' && r.created_at
              ? rows.map((row: any) => ({ ...row, __file_created_at: row.__file_created_at ?? r.created_at }))
              : rows;
            agg[cat].push(...processedRows);
            if (cat === 'ventas') {
              for (const row of rows) taggedVentas.push({ row, fileUploadId: r.file_upload_id });
            }
            if (cat === 'gastos') {
              for (const row of rows) taggedGastos.push({ row, fileUploadId: r.file_upload_id });
            }
            if (cat === 'marketing') {
              for (const row of rows) taggedMarketing.push({ row, fileUploadId: r.file_upload_id });
            }
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
      setTaggedVentasRows(taggedVentas);
      setTaggedGastosRows(taggedGastos);
      setTaggedMarketingRows(taggedMarketing);
      setLastUploadDates(freshnessDates);
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

  // Detect periods with data from multiple source files across ventas, gastos y marketing
  const duplicatedPeriods = useMemo(() => {
    if (!data) return [];

    const duplicated = new Set<string>();
    const ventasFinder = (row: any, kw: string[]) => findString(row, kw, mappings.ventas?.date);
    const gastosFinder = (row: any, kw: string[]) => findString(row, kw, mappings.gastos?.date);
    const marketingFinder = (row: any, kw: string[]) => findString(row, kw, mappings.marketing?.date);

    if (taggedVentasRows.length > 0) {
      for (const month of detectMultiSourcePeriods(taggedVentasRows, FIELD_DATE, ventasFinder)) duplicated.add(month);
    }
    if (taggedGastosRows.length > 0) {
      for (const month of detectMultiSourcePeriods(taggedGastosRows, FIELD_DATE, gastosFinder)) duplicated.add(month);
    }
    if (taggedMarketingRows.length > 0) {
      for (const month of detectMultiSourcePeriods(taggedMarketingRows, FIELD_DATE, marketingFinder)) duplicated.add(month);
    }

    return Array.from(duplicated).sort();
  }, [data, mappings, taggedVentasRows, taggedGastosRows, taggedMarketingRows]);

  // Detect currency mix in ventas and gastos
  const hasCurrencyMix = useMemo(() => {
    if (!data) return { ventas: false, gastos: false };
    return {
      ventas: data.ventas.length > 0 && detectCurrencyMix(data.ventas, FIELD_AMOUNT),
      gastos: data.gastos.length > 0 && detectCurrencyMix(data.gastos, FIELD_AMOUNT),
    };
  }, [data]);

  // C2: Detected currency codes for richer UI warnings
  const detectedCurrencies = useMemo(() => {
    if (!data) return { ventas: [], gastos: [] };
    return {
      ventas: data.ventas.length > 0 ? Array.from(detectCurrencies(data.ventas, FIELD_AMOUNT)) : [],
      gastos: data.gastos.length > 0 ? Array.from(detectCurrencies(data.gastos, FIELD_AMOUNT)) : [],
    };
  }, [data]);

  return (
    <ExtractedDataContext.Provider value={{ data, mappings, loading, hasData, availableMonths, duplicatedPeriods, hasCurrencyMix, detectedCurrencies, taggedVentasRows, taggedGastosRows, taggedMarketingRows, lastUploadDates, refetch: fetchData }}>
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
