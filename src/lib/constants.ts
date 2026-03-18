export const APP_NAME = 'World of Data';

export const INDUSTRIES = [
  'Retail',
  'Gastronomía',
  'Servicios profesionales',
  'Manufactura',
  'Tecnología',
  'Salud',
  'Construcción',
  'Otro',
] as const;

export const EMPLOYEE_RANGES = ['1-5', '6-15', '16-50', '50+'] as const;
export const YEARS_RANGES = ['Menos de 1 año', '1-3 años', '3-10 años', 'Más de 10 años'] as const;
export const SKU_RANGES = ['1-50', '51-200', '201-1000', '1000+'] as const;
export const ACCOUNTING_METHODS = ['Excel / Google Sheets', 'Sistema contable', 'Nada / papel', 'Otro'] as const;

export const GOALS = [
  'Tener visibilidad clara de ventas y ganancias',
  'Controlar mi stock e inventario',
  'Predecir cómo va a venir el próximo mes/trimestre',
  'Saber cuánto voy a tener en caja a fin de mes',
  'Recibir alertas cuando algo necesite mi atención',
  'Medir el rendimiento de mi inversión publicitaria',
  'Tener un sistema donde mis empleados carguen datos',
  'Todo lo anterior',
] as const;
