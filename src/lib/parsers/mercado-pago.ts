/**
 * Mercado Pago activity export parser.
 *
 * Typical headers (Spanish, MP "Reporte de actividad"):
 *   "Fecha de origen", "Fecha de aprobación", "Detalle de la operación",
 *   "Tipo de operación", "Estado", "ID de operación",
 *   "Valor del producto", "Comisión", "Dinero recibido",
 *   "Medio de pago", "Cuotas", "Nombre del comprador".
 */

import type { SystemParser, ParserResult } from './types';
import { countMatches, findHeader, normalizeHeader } from './types';

const STRONG_SIGNALS = [
  'fecha de origen', 'fechadeorigen',
  'detalle de la operacion', 'detalledelaoperacion',
  'tipo de operacion', 'tipodeoperacion',
  'dinero recibido', 'dinerorecibido',
  'id de operacion', 'iddeoperacion',
];

const SECONDARY_SIGNALS = [
  'fecha de aprobacion', 'comision', 'medio de pago', 'cuotas',
  'valor del producto', 'estado',
];

export const mercadoPagoParser: SystemParser = {
  systemId: 'mercado_pago',

  match(headers: string[]): number {
    const strong = countMatches(headers, STRONG_SIGNALS);
    const secondary = countMatches(headers, SECONDARY_SIGNALS);
    const norm = headers.map(normalizeHeader).join(' ');
    const fingerprint = norm.includes('dinerorecibido') || norm.includes('iddeoperacion');
    if (!fingerprint && strong < 2) return 0;
    if (strong >= 3) return 0.95;
    if (strong >= 2) return 0.88;
    if (strong === 1 && secondary >= 2) return 0.78;
    return 0.5;
  },

  parse(headers: string[]): ParserResult {
    const warnings: string[] = [];
    const mapping: Record<string, string> = {};

    const date = findHeader(headers, ['fecha de origen', 'fechadeorigen', 'fecha de aprobacion', 'fecha de aprobación', 'fecha']);
    if (date) mapping.date = date; else warnings.push('No se encontró columna de fecha');

    const detail = findHeader(headers, ['detalle de la operacion', 'detalle de la operación', 'detalledelaoperacion', 'descripcion', 'descripción']);
    if (detail) mapping.name = detail;

    const type = findHeader(headers, ['tipo de operacion', 'tipo de operación', 'tipodeoperacion']);
    if (type) mapping.type = type;

    const status = findHeader(headers, ['estado', 'status']);
    if (status) mapping.status = status;

    // MP exports separate the gross product value, the commission and the
    // net "Dinero recibido". For our purposes the net received is the most
    // useful "amount" — it's what actually hit the merchant's account.
    const received = findHeader(headers, ['dinero recibido', 'dinerorecibido']);
    const gross = findHeader(headers, ['valor del producto', 'valordelproducto']);
    if (received) {
      mapping.amount = received;
    } else if (gross) {
      mapping.amount = gross;
      warnings.push('Se usó "Valor del producto" como monto (no se encontró "Dinero recibido")');
    } else {
      warnings.push('No se encontró columna de monto');
    }

    const commission = findHeader(headers, ['comision', 'comisión']);
    if (commission) mapping.commission = commission;

    const paymentMethod = findHeader(headers, ['medio de pago', 'mediodepago', 'metodo de pago', 'método de pago']);
    if (paymentMethod) mapping.payment_method = paymentMethod;

    const id = findHeader(headers, ['id de operacion', 'id de operación', 'iddeoperacion', 'numero de operacion']);
    if (id) mapping.invoice_number = id;

    const buyer = findHeader(headers, ['nombre del comprador', 'comprador', 'cliente']);
    if (buyer) mapping.client = buyer;

    const got = ['amount', 'date'].filter(k => mapping[k]).length;
    const confidence = got === 2 ? 0.9 : got === 1 ? 0.7 : 0.4;
    // MP activity reports are most often used as "ventas" (income from MP).
    return { mapping, confidence, warnings, category: 'ventas' };
  },
};
