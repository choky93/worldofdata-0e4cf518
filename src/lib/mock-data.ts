// Mock data for Star Impresiones 3D

export const mockCompany = {
  name: 'Star Impresiones 3D',
  industry: 'Tecnología',
  employeeCount: '6-15',
  yearsOperating: '3-10 años',
};

export const mockMonthlySales = [
  { month: 'Abr 2025', value: 1200000 },
  { month: 'May 2025', value: 980000 },
  { month: 'Jun 2025', value: 1450000 },
  { month: 'Jul 2025', value: 1100000 },
  { month: 'Ago 2025', value: 1320000 },
  { month: 'Sep 2025', value: 1580000 },
  { month: 'Oct 2025', value: 1750000 },
  { month: 'Nov 2025', value: 2100000 },
  { month: 'Dic 2025', value: 2480000 },
  { month: 'Ene 2026', value: 1650000 },
  { month: 'Feb 2026', value: 1420000 },
  { month: 'Mar 2026', value: 1240000 },
];

export const mockDailySales = Array.from({ length: 18 }, (_, i) => ({
  day: `${i + 1}/03`,
  value: Math.round(40000 + Math.random() * 80000),
}));

export const mockSalesCurrentMonth = {
  accumulated: 1240000,
  estimated: 2100000,
  previousMonth: 1420000,
  previousYearSameMonth: 1100000,
  progressPercent: 59,
};

export const mockProfit = {
  totalSales: 1240000,
  variableCosts: 620000,
  fixedCosts: 285000,
  netProfit: 335000,
  marginPercent: 27,
  previousMonthProfit: 380000,
};

export const mockCashFlow = {
  availableToday: 890000,
  estimatedEndOfMonth: 620000,
  pendingCollections: 380000,
  pendingPayments: 650000,
  status: 'warning' as const,
};

export const mockAds = {
  totalSpend: 185000,
  roas: 4.2,
  previousMonthSpend: 160000,
  campaigns: [
    { name: 'Filamentos PLA - Meta', spend: 85000, revenue: 380000, roas: 4.5 },
    { name: 'Impresoras - Google', spend: 60000, revenue: 240000, roas: 4.0 },
    { name: 'Repuestos - Meta', spend: 40000, revenue: 150000, roas: 3.8 },
  ],
};

export const mockExpenses = [
  { name: 'Alquiler depósito', amount: 120000, dueDate: '2026-03-25', status: 'pending' as const },
  { name: 'Proveedor filamentos', amount: 280000, dueDate: '2026-03-20', status: 'pending' as const },
  { name: 'Servicios (luz/gas/internet)', amount: 45000, dueDate: '2026-03-15', status: 'paid' as const },
  { name: 'Sueldos', amount: 650000, dueDate: '2026-03-28', status: 'pending' as const },
  { name: 'Seguro', amount: 35000, dueDate: '2026-03-10', status: 'paid' as const },
  { name: 'Proveedor impresoras', amount: 450000, dueDate: '2026-03-05', status: 'overdue' as const },
];

export const mockProducts = [
  { id: '1', name: 'Filamento PLA 1kg', stock: 245, minStock: 50, maxStock: 200, price: 8500, cost: 4200, status: 'overstock' as const },
  { id: '2', name: 'Filamento PETG 1kg', stock: 82, minStock: 30, maxStock: 150, price: 12000, cost: 6500, status: 'ok' as const },
  { id: '3', name: 'Impresora Ender 3 V3', stock: 4, minStock: 5, maxStock: 20, price: 350000, cost: 210000, status: 'low' as const },
  { id: '4', name: 'Hotend E3D V6', stock: 38, minStock: 10, maxStock: 40, price: 25000, cost: 12000, status: 'ok' as const },
  { id: '5', name: 'Cama caliente 235x235', stock: 2, minStock: 8, maxStock: 30, price: 18000, cost: 9500, status: 'low' as const },
  { id: '6', name: 'Filamento ABS 1kg', stock: 180, minStock: 40, maxStock: 120, price: 9500, cost: 4800, status: 'overstock' as const },
  { id: '7', name: 'Boquilla 0.4mm (pack x5)', stock: 65, minStock: 20, maxStock: 80, price: 5500, cost: 2200, status: 'ok' as const },
  { id: '8', name: 'Resina UV 1L', stock: 15, minStock: 10, maxStock: 50, price: 22000, cost: 13000, status: 'ok' as const },
];

export const mockClients = [
  { id: '1', name: 'TecnoPlast SRL', totalPurchases: 3200000, pendingPayment: 180000, lastPurchase: '2026-03-12' },
  { id: '2', name: 'MakerSpace BA', totalPurchases: 2800000, pendingPayment: 0, lastPurchase: '2026-03-10' },
  { id: '3', name: 'Diseño 3D Studio', totalPurchases: 1950000, pendingPayment: 120000, lastPurchase: '2026-03-08' },
  { id: '4', name: 'FabLab Córdoba', totalPurchases: 1500000, pendingPayment: 80000, lastPurchase: '2026-02-28' },
  { id: '5', name: 'Proto Ingeniería', totalPurchases: 1200000, pendingPayment: 0, lastPurchase: '2026-03-15' },
  { id: '6', name: 'ArqPrint', totalPurchases: 890000, pendingPayment: 0, lastPurchase: '2026-02-20' },
  { id: '7', name: 'Dental3D', totalPurchases: 750000, pendingPayment: 0, lastPurchase: '2026-03-05' },
  { id: '8', name: 'Juguetes Custom', totalPurchases: 420000, pendingPayment: 0, lastPurchase: '2026-01-15' },
];

export const mockAlerts = [
  { id: '1', type: 'stock' as const, priority: 'high' as const, message: 'Vendé 45 unidades de Filamento PLA 1kg — está sobreestockado y es plata que podrías invertir', read: false, date: '2026-03-18' },
  { id: '2', type: 'stock' as const, priority: 'high' as const, message: 'Comprá Impresora Ender 3 V3 esta semana — solo quedan 4 unidades y tu promedio de venta es 3/semana', read: false, date: '2026-03-18' },
  { id: '3', type: 'clients' as const, priority: 'medium' as const, message: 'TecnoPlast SRL, Diseño 3D Studio y FabLab Córdoba te deben $380.000 — contactalos para gestionar el cobro', read: false, date: '2026-03-17' },
  { id: '4', type: 'finance' as const, priority: 'medium' as const, message: 'El 47% de tus ventas depende de 2 clientes — diversificá tu cartera para reducir riesgo', read: true, date: '2026-03-16' },
  { id: '5', type: 'forecast' as const, priority: 'low' as const, message: 'Basado en los últimos 2 años, abril es tu segundo mejor mes. Preparate con stock suficiente de filamentos', read: false, date: '2026-03-15' },
  { id: '6', type: 'stock' as const, priority: 'high' as const, message: 'Cama caliente 235x235 — solo quedan 2 unidades. Tu proveedor tarda 15 días en entregar', read: false, date: '2026-03-15' },
  { id: '7', type: 'finance' as const, priority: 'medium' as const, message: 'Proveedor impresoras tiene un pago vencido de $450.000. Regularizá la situación', read: false, date: '2026-03-14' },
];

export const mockForecast = {
  currentMonth: { estimated: 2100000, confidence: 'alta' as const, trend: 'up' as const },
  nextMonth: { estimated: 2350000, confidence: 'media' as const, trend: 'up' as const },
  quarterly: { estimated: 6200000, confidence: 'media' as const, trend: 'stable' as const },
  seasonality: [
    { month: 'Ene', factor: 0.78 },
    { month: 'Feb', factor: 0.67 },
    { month: 'Mar', factor: 0.85 },
    { month: 'Abr', factor: 1.15 },
    { month: 'May', factor: 0.92 },
    { month: 'Jun', factor: 0.88 },
    { month: 'Jul', factor: 0.75 },
    { month: 'Ago', factor: 0.82 },
    { month: 'Sep', factor: 1.05 },
    { month: 'Oct', factor: 1.12 },
    { month: 'Nov', factor: 1.35 },
    { month: 'Dic', factor: 1.55 },
  ],
};

export const mockFinancial = {
  // Presupuesto Financiero (devengado)
  financial: {
    totalSales: 2100000,
    totalCosts: 1450000,
    netResult: 650000,
  },
  // Presupuesto Económico (caja)
  economic: {
    totalIncome: 1720000,
    totalExpenses: 1100000,
    netCash: 620000,
  },
};

export const mockMetrics = {
  salesEvolution: mockMonthlySales,
  marginEvolution: [
    { month: 'Abr 2025', value: 22 },
    { month: 'May 2025', value: 24 },
    { month: 'Jun 2025', value: 26 },
    { month: 'Jul 2025', value: 23 },
    { month: 'Ago 2025', value: 25 },
    { month: 'Sep 2025', value: 28 },
    { month: 'Oct 2025', value: 27 },
    { month: 'Nov 2025', value: 30 },
    { month: 'Dic 2025', value: 32 },
    { month: 'Ene 2026', value: 26 },
    { month: 'Feb 2026', value: 25 },
    { month: 'Mar 2026', value: 27 },
  ],
  cashFlowEvolution: [
    { month: 'Abr 2025', value: 350000 },
    { month: 'May 2025', value: 280000 },
    { month: 'Jun 2025', value: 420000 },
    { month: 'Jul 2025', value: 310000 },
    { month: 'Ago 2025', value: 380000 },
    { month: 'Sep 2025', value: 520000 },
    { month: 'Oct 2025', value: 580000 },
    { month: 'Nov 2025', value: 720000 },
    { month: 'Dic 2025', value: 890000 },
    { month: 'Ene 2026', value: 560000 },
    { month: 'Feb 2026', value: 480000 },
    { month: 'Mar 2026', value: 620000 },
  ],
};

export const mockOperations = [
  { id: '1', type: 'purchase' as const, description: 'Compra lote impresoras Ender 3 V3 x10', amount: 2100000, date: '2026-03-01', counterpart: 'Creality Argentina' },
  { id: '2', type: 'sale' as const, description: 'Venta mayorista filamentos x200kg', amount: 1700000, date: '2026-03-05', counterpart: 'TecnoPlast SRL' },
  { id: '3', type: 'purchase' as const, description: 'Compra resina UV x50L', amount: 650000, date: '2026-03-08', counterpart: 'Elegoo Distribuidor' },
  { id: '4', type: 'sale' as const, description: 'Servicio impresión piezas industriales', amount: 420000, date: '2026-03-12', counterpart: 'Proto Ingeniería' },
];
