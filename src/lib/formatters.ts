export function formatCurrency(value: number): string {
  return '$' + value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Compact currency format for KPI cards: $1.34B, $226M, $12K.
 * Use only in cards/badges, NOT in tables or tooltips.
 */
export function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return formatCurrency(value);
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
 * Pluralización en español. Si abs(n) === 1 usa singular; si no, plural.
 * Ej: pluralES(1, 'día', 'días') → '1 día'; pluralES(7, 'día', 'días') → '7 días'.
 * Ej: pluralES(0, 'producto', 'productos') → '0 productos'.
 */
export function pluralES(n: number, singular: string, plural: string): string {
  return `${n} ${Math.abs(n) === 1 ? singular : plural}`;
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

/**
 * Relative time helper used by freshness pills, dataset list, audit trail.
 * Returns "Hoy" / "Ayer" / "Hace 3d" / "Hace 2 sem" / "Hace 4 mes" — short
 * Spanish form so it fits inside compact badges.
 */
export function formatRelativeTime(date: Date | string | number | null | undefined): string {
  if (date == null) return '—';
  const t = typeof date === 'number' ? date : new Date(date).getTime();
  if (!isFinite(t)) return '—';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 0) return 'Hoy';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days}d`;
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem`;
  if (days < 365) return `Hace ${Math.floor(days / 30)} mes`;
  return `Hace ${Math.floor(days / 365)} año${Math.floor(days / 365) === 1 ? '' : 's'}`;
}

/** Days elapsed since `date` (>= 0). Returns null if input is unparseable. */
export function daysSince(date: Date | string | number | null | undefined): number | null {
  if (date == null) return null;
  const t = typeof date === 'number' ? date : new Date(date).getTime();
  if (!isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
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
