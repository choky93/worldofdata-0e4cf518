/**
 * Lightweight client-side category heuristic.
 *
 * Used by the Schema Preview dialog to give the user a fast suggestion
 * BEFORE the full AI classification runs server-side. Not a replacement —
 * the AI still classifies definitively. This is just for the preview UX.
 *
 * Approach: score each category by how many of its signature header
 * keywords appear (normalized) in the parsed headers. Highest score wins.
 * Confidence is a 0–1 ratio of matches over the total signature size.
 */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Category signatures: header tokens that strongly indicate this category.
// Tokens are matched against normalized headers via substring containment.
const SIGNATURES: Record<string, string[]> = {
  ventas: ['venta', 'ingreso', 'factura', 'ticket', 'producto', 'cliente', 'monto', 'importe', 'precio', 'cantidad'],
  gastos: ['gasto', 'compra', 'proveedor', 'costo', 'pago', 'egreso', 'importe', 'concepto'],
  stock: ['stock', 'inventario', 'producto', 'cantidad', 'sku', 'codigo', 'existencia', 'almacen'],
  marketing: ['campana', 'campaign', 'spend', 'cpc', 'impresiones', 'clicks', 'roas', 'conversion', 'ctr', 'alcance'],
  clientes: ['cliente', 'razonsocial', 'cuit', 'telefono', 'email', 'contacto', 'empresa'],
  facturas: ['factura', 'cae', 'emisor', 'receptor', 'comprobante', 'tipo', 'punto', 'numero'],
  rrhh: ['empleado', 'sueldo', 'salario', 'haber', 'legajo', 'cuil', 'puesto', 'nomina'],
  // Ola 21: CRM (Salesforce/HubSpot/Pipedrive/Zoho/Dynamics exports).
  // Tokens muy fuertes para distinguir de "ventas" tradicional.
  crm: ['stage', 'pipeline', 'opportunity', 'deal', 'account', 'owner', 'lead', 'probability', 'closedate', 'expectedclose', 'forecast', 'lifecycle', 'salesrep'],
};

export interface SchemaCategorySuggestion {
  category: string;
  confidence: number;
  matchedTokens: string[];
}

export function suggestCategory(headers: string[]): SchemaCategorySuggestion {
  const normalizedHeaders = headers.map(normalize);
  let best: SchemaCategorySuggestion = { category: 'otro', confidence: 0, matchedTokens: [] };
  for (const [cat, tokens] of Object.entries(SIGNATURES)) {
    const matched: string[] = [];
    for (const tok of tokens) {
      if (normalizedHeaders.some(nh => nh.includes(tok))) matched.push(tok);
    }
    const score = matched.length;
    const confidence = score / tokens.length;
    if (score > 0 && confidence > best.confidence) {
      best = { category: cat, confidence, matchedTokens: matched };
    }
  }
  return best;
}
