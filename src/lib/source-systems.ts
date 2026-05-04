/**
 * Source-system segmentation (Wave A).
 *
 * Captured at upload time via two mandatory dropdowns (Categoría + Sistema)
 * so we can:
 *   1. Route the file to a deterministic parser when one exists (Wave B).
 *   2. Specialize the AI prompt with strong priors about expected columns.
 *   3. Eventually skip the AI call entirely for known formats (cost win).
 *
 * `SourceSystem` is the canonical snake_case ID persisted in
 * `file_uploads.source_system`. Labels are user-facing Spanish strings.
 */

export type Category =
  | 'ventas'
  | 'gastos'
  | 'marketing'
  | 'stock'
  | 'clientes'
  | 'facturas'
  | 'otro';

export const SOURCE_SYSTEMS = [
  // Argentinian gestión / ERPs
  'tango',
  'bejerman',
  'contabilium',
  'xubio',
  // E-commerce / marketplaces
  'mercado_libre',
  'tienda_nube',
  'shopify',
  'pos_generico',
  // Pagos / fiscal
  'mercado_pago',
  'afip_mis_comprobantes',
  // Marketing platforms
  'meta_ads',
  'google_ads',
  'tiktok_ads',
  'linkedin_ads',
  'mailchimp',
  // CRM
  'pipedrive',
  'hubspot',
  'salesforce',
  'zoho',
  // Generic
  'excel_manual',
  'otro',
] as const;

export type SourceSystem = typeof SOURCE_SYSTEMS[number];

export const SOURCE_SYSTEMS_BY_CATEGORY: Record<Category, readonly SourceSystem[]> = {
  ventas: ['tango', 'bejerman', 'contabilium', 'xubio', 'mercado_libre', 'tienda_nube', 'shopify', 'pos_generico', 'excel_manual', 'otro'],
  gastos: ['tango', 'bejerman', 'contabilium', 'xubio', 'afip_mis_comprobantes', 'mercado_pago', 'excel_manual', 'otro'],
  marketing: ['meta_ads', 'google_ads', 'tiktok_ads', 'linkedin_ads', 'mailchimp', 'excel_manual', 'otro'],
  stock: ['tango', 'bejerman', 'contabilium', 'tienda_nube', 'shopify', 'mercado_libre', 'excel_manual', 'otro'],
  clientes: ['pipedrive', 'hubspot', 'salesforce', 'zoho', 'tango', 'excel_manual', 'otro'],
  facturas: ['afip_mis_comprobantes', 'tango', 'bejerman', 'contabilium', 'xubio', 'excel_manual', 'otro'],
  otro: ['excel_manual', 'otro'],
};

export const SOURCE_SYSTEM_LABELS: Record<SourceSystem, string> = {
  tango: 'Tango Gestión',
  bejerman: 'Bejerman',
  contabilium: 'Contabilium',
  xubio: 'Xubio',
  mercado_libre: 'Mercado Libre',
  tienda_nube: 'Tienda Nube',
  shopify: 'Shopify',
  pos_generico: 'POS genérico',
  mercado_pago: 'Mercado Pago',
  afip_mis_comprobantes: 'AFIP — Mis Comprobantes',
  meta_ads: 'Meta Ads (Facebook/Instagram)',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
  linkedin_ads: 'LinkedIn Ads',
  mailchimp: 'Mailchimp',
  pipedrive: 'Pipedrive',
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
  zoho: 'Zoho CRM',
  excel_manual: 'Excel / CSV manual',
  otro: 'Otro / no listado',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  ventas: 'Ventas',
  gastos: 'Gastos',
  marketing: 'Marketing',
  stock: 'Stock',
  clientes: 'Clientes',
  facturas: 'Facturas',
  otro: 'Otro',
};

export function getSystemsForCategory(cat: Category): readonly SourceSystem[] {
  return SOURCE_SYSTEMS_BY_CATEGORY[cat] ?? [];
}

export function getSystemLabel(sys: SourceSystem): string {
  return SOURCE_SYSTEM_LABELS[sys] ?? sys;
}

export function isSourceSystem(value: string | null | undefined): value is SourceSystem {
  return !!value && (SOURCE_SYSTEMS as readonly string[]).includes(value);
}
