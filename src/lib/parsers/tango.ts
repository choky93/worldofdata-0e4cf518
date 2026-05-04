/**
 * Tango Gestión export parser.
 *
 * Tango is the most common gestión software for Argentinian PyMEs.
 * Typical headers depending on the export:
 *
 *   Ventas / Facturación:
 *     "Cód. Cliente", "Razón Social", "Fecha", "Tipo Comprobante",
 *     "Letra", "Punto Vta.", "Número", "Importe Neto", "IVA",
 *     "Importe Total".
 *
 *   Stock:
 *     "Cód. Producto", "Descripción", "Stock", "Stock Mínimo",
 *     "Precio", "Precio de Costo".
 */

import type { SystemParser, ParserResult } from './types';
import { countMatches, findHeader, normalizeHeader } from './types';

const VENTAS_SIGNALS = [
  'cod cliente', 'codcliente', 'cliente',
  'razon social', 'razonsocial',
  'tipo comprobante', 'tipocomprobante',
  'punto vta', 'puntovta', 'punto venta',
  'importe total', 'importetotal',
  'importe neto', 'importeneto',
];

const STOCK_SIGNALS = [
  'cod producto', 'codproducto',
  'stock minimo', 'stockminimo',
  'precio de costo', 'preciodecosto',
  'descripcion',
];

export const tangoParser: SystemParser = {
  systemId: 'tango',

  match(headers: string[]): number {
    const ventas = countMatches(headers, VENTAS_SIGNALS);
    const stock = countMatches(headers, STOCK_SIGNALS);
    // Tango is recognisable by its distinctive abbreviations ("Cód.", "Vta.").
    const norm = headers.map(normalizeHeader).join(' ');
    const tangoFingerprint = (norm.includes('cod') && (norm.includes('cliente') || norm.includes('producto')))
      || norm.includes('puntovta');

    if (!tangoFingerprint) return 0;
    if (ventas >= 4) return 0.9;
    if (stock >= 3) return 0.88;
    if (ventas >= 3 || stock >= 2) return 0.78;
    return 0.5;
  },

  parse(headers: string[]): ParserResult {
    const warnings: string[] = [];
    const mapping: Record<string, string> = {};

    // Detect intent (ventas vs stock) by looking at unique markers.
    const norm = headers.map(normalizeHeader).join(' ');
    const isStock = norm.includes('stockminimo') || (norm.includes('codproducto') && !norm.includes('codcliente'));

    if (isStock) {
      const name = findHeader(headers, ['descripcion', 'descripción', 'producto', 'detalle']);
      if (name) mapping.name = name;
      const sku = findHeader(headers, ['cod producto', 'cod. producto', 'codproducto', 'codigo']);
      if (sku) mapping.sku = sku;
      const qty = findHeader(headers, ['stock', 'cantidad', 'unidades', 'existencia']);
      if (qty) mapping.quantity = qty;
      const minStock = findHeader(headers, ['stock minimo', 'stock mínimo', 'stockminimo', 'minimo']);
      if (minStock) mapping.min_stock = minStock;
      const price = findHeader(headers, ['precio', 'precio venta', 'precio de venta']);
      if (price) mapping.price = price;
      const cost = findHeader(headers, ['precio de costo', 'precio costo', 'costo']);
      if (cost) mapping.cost = cost;

      const got = ['name', 'quantity'].filter(k => mapping[k]).length;
      const confidence = got === 2 ? 0.9 : got === 1 ? 0.7 : 0.4;
      return { mapping, confidence, warnings, category: 'stock' };
    }

    // Ventas / facturas
    const date = findHeader(headers, ['fecha', 'fecha venta', 'fecha emision']);
    if (date) mapping.date = date; else warnings.push('No se encontró columna Fecha');

    const client = findHeader(headers, ['razon social', 'razón social', 'razonsocial', 'cliente', 'nombre cliente']);
    if (client) mapping.client = client;

    const clientCode = findHeader(headers, ['cod cliente', 'cod. cliente', 'codcliente']);
    if (clientCode && !mapping.client) mapping.client = clientCode;

    const total = findHeader(headers, ['importe total', 'importetotal', 'total']);
    if (total) mapping.amount = total;

    const net = findHeader(headers, ['importe neto', 'importeneto', 'neto', 'subtotal']);
    if (net) mapping.net_amount = net;

    const tax = findHeader(headers, ['iva']);
    if (tax) mapping.tax = tax;

    const tipo = findHeader(headers, ['tipo comprobante', 'tipocomprobante', 'tipo']);
    if (tipo) mapping.type = tipo;

    const numero = findHeader(headers, ['numero', 'número', 'nro', 'comprobante']);
    if (numero) mapping.number = numero;

    // Decide category — if Tipo Comprobante exists assume facturas, else ventas.
    const category = tipo ? 'facturas' : 'ventas';
    if (category === 'facturas' && !mapping.amount) mapping.amount = total ?? '';

    const got = ['amount', 'date'].filter(k => mapping[k]).length;
    const confidence = got === 2 ? 0.9 : got === 1 ? 0.7 : 0.4;
    return { mapping, confidence, warnings, category };
  },
};
