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

// ─── Strategic Diagnosis ─────────────────────────────────────────────

export const PAIN_POINTS = [
  { id: 'no-visibility', label: 'No tengo visibilidad real de cómo va mi negocio', icon: '📊', dimension: 'Ventas' },
  { id: 'cash-chaos', label: 'No sé cuánta plata voy a tener a fin de mes', icon: '💸', dimension: 'Finanzas' },
  { id: 'stock-blind', label: 'Me quedo sin stock o compro de más', icon: '📦', dimension: 'Stock' },
  { id: 'client-risk', label: 'Dependo de pocos clientes y no puedo diversificar', icon: '👥', dimension: 'Clientes' },
  { id: 'ads-waste', label: 'Invierto en publicidad pero no sé si funciona', icon: '📢', dimension: 'Marketing' },
  { id: 'everything-manual', label: 'Todo es manual, no puedo escalar', icon: '⚙️', dimension: 'Operaciones' },
] as const;

export const MATURITY_QUESTIONS = [
  {
    id: 'decisions',
    question: '¿Cómo tomás las decisiones importantes de tu negocio?',
    options: [
      { value: 1, label: 'Por intuición o experiencia' },
      { value: 2, label: 'Miro algunos números pero no siempre' },
      { value: 3, label: 'Tengo reportes que reviso regularmente' },
      { value: 4, label: 'Tengo dashboards y KPIs definidos' },
    ],
  },
  {
    id: 'margin',
    question: '¿Sabés cuál es tu margen de ganancia real?',
    options: [
      { value: 1, label: 'No, ni idea' },
      { value: 2, label: 'Más o menos, lo calculo a ojo' },
      { value: 3, label: 'Sí, lo calculo mensualmente' },
      { value: 4, label: 'Sí, lo monitoreo en tiempo real' },
    ],
  },
  {
    id: 'scale',
    question: 'Si mañana duplicaras tus ventas, ¿tu operación lo aguanta?',
    options: [
      { value: 1, label: 'Imposible, colapsaríamos' },
      { value: 2, label: 'Con mucho esfuerzo, quizá' },
      { value: 3, label: 'Sí, pero habría que ajustar cosas' },
      { value: 4, label: 'Sí, estamos preparados' },
    ],
  },
] as const;

export type MaturityClassification = 'reactiva' | 'en-transicion' | 'ordenada' | 'escalable';

export const MATURITY_LABELS: Record<MaturityClassification, { title: string; emoji: string; description: string; color: string }> = {
  'reactiva': {
    title: 'Empresa Reactiva',
    emoji: '🔴',
    description: 'Operás apagando incendios. Las decisiones son por instinto y no hay datos claros. Hay mucho potencial de mejora.',
    color: 'destructive',
  },
  'en-transicion': {
    title: 'Empresa en Transición',
    emoji: '🟡',
    description: 'Tenés algo de estructura pero falta consistencia. Algunos procesos están organizados, otros no.',
    color: 'warning',
  },
  'ordenada': {
    title: 'Empresa Ordenada',
    emoji: '🟢',
    description: 'Tenés buenos procesos y datos. Podés optimizar para crecer con más eficiencia.',
    color: 'success',
  },
  'escalable': {
    title: 'Empresa Escalable',
    emoji: '🚀',
    description: 'Tu operación está lista para crecer. World of Data va a potenciar lo que ya hacés bien.',
    color: 'primary',
  },
};

export function getMaturityClassification(avgScore: number): MaturityClassification {
  if (avgScore <= 1.5) return 'reactiva';
  if (avgScore <= 2.5) return 'en-transicion';
  if (avgScore <= 3.3) return 'ordenada';
  return 'escalable';
}

export function getImprovementPotential(classification: MaturityClassification): number {
  const map: Record<MaturityClassification, number> = {
    'reactiva': 65,
    'en-transicion': 42,
    'ordenada': 25,
    'escalable': 12,
  };
  return map[classification];
}
