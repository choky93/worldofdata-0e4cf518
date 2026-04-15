export function formatCurrency(value: number): string {
  return '$' + value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatCurrencyFull(value: number): string {
  return '$' + value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPercent(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

export function formatNumber(value: number): string {
  return value.toLocaleString('es-AR');
}

/**
 * Parse a number from various locale formats:
 * - "1.717.146,04" (es-AR)
 * - "$ 961.199,79"
 * - "84.30389878" (plain decimal)
 * - "$1,234.56" (en-US)
 * - "—", "", null → 0
 */
export function parseLocalNumber(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const s = String(raw).trim().replace(/^[$\s]+/, '').replace(/\s+/g, '');
  if (!s || s === '—' || s === '-') return 0;

  // Detect format: if has both . and , determine which is decimal separator
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  let cleaned: string;
  if (lastComma > lastDot) {
    // es-AR format: dots are thousands, comma is decimal (1.717.146,04)
    cleaned = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    // en-US format: commas are thousands, dot is decimal (1,234.56)
    cleaned = s.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    // Only comma, could be decimal: "845,88"
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = s.replace(',', '.');
    } else {
      cleaned = s.replace(/,/g, '');
    }
  } else {
    cleaned = s;
  }

  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buen día';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Safe division — returns fallback on zero, NaN, or Infinity.
 */
export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || isNaN(denominator) || !isFinite(denominator)) return fallback;
  const result = numerator / denominator;
  return isFinite(result) ? result : fallback;
}

/**
 * Format a date-like string for chart X-axis: "Nov 23", "Dic 23"
 */
export function formatXAxisDate(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
      .replace('.', '')
      .replace(/^\w/, c => c.toUpperCase());
  }
  // Already formatted like "nov 2023" or "nov. 2023" — clean up
  const cleaned = value.replace('.', '').replace(/^\w/, c => c.toUpperCase());
  // Shorten year: "Nov 2023" → "Nov 23"
  return cleaned.replace(/(\d{4})$/, (_, y) => y.slice(2));
}

/**
 * Format a date-like string for chart tooltip label: "Noviembre 2023"
 */
export function formatTooltipDate(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
      .replace(/^\w/, c => c.toUpperCase());
  }
  // Parse "nov 2023" style
  const months: Record<string, string> = {
    ene: 'Enero', feb: 'Febrero', mar: 'Marzo', abr: 'Abril',
    may: 'Mayo', jun: 'Junio', jul: 'Julio', ago: 'Agosto',
    sep: 'Septiembre', oct: 'Octubre', nov: 'Noviembre', dic: 'Diciembre',
  };
  const match = value.toLowerCase().replace('.', '').match(/^(\w{3})\s+(\d{2,4})$/);
  if (match) {
    const full = months[match[1]] || match[1];
    const year = match[2].length === 2 ? `20${match[2]}` : match[2];
    return `${full} ${year}`;
  }
  return value;
}
