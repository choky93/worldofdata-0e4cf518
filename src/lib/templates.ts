/**
 * Downloadable CSV templates (5.12).
 *
 * Pre-formatted with the exact column names the AI classifier and
 * heuristic mapper recognize, so users who follow the template get
 * 100% mapping accuracy without needing the Schema Preview override.
 */

export interface Template {
  id: string;
  label: string;
  emoji: string;
  description: string;
  filename: string;
  headers: string[];
  sampleRows: (string | number)[][];
}

export const TEMPLATES: Template[] = [
  {
    id: 'ventas',
    label: 'Ventas',
    emoji: '📊',
    description: 'Registro de ventas: fecha, producto, cantidad, monto.',
    filename: 'plantilla_ventas.csv',
    headers: ['fecha', 'producto', 'cantidad', 'precio_unitario', 'monto_total', 'cliente'],
    sampleRows: [
      ['2024-01-15', 'Producto A', 2, 1500, 3000, 'Cliente Ejemplo SA'],
      ['2024-01-16', 'Producto B', 1, 4500, 4500, 'Otro Cliente SRL'],
    ],
  },
  {
    id: 'gastos',
    label: 'Gastos',
    emoji: '💰',
    description: 'Compras a proveedores, gastos operativos, servicios.',
    filename: 'plantilla_gastos.csv',
    headers: ['fecha', 'concepto', 'proveedor', 'monto', 'categoria'],
    sampleRows: [
      ['2024-01-10', 'Compra de insumos', 'Proveedor X', 12500, 'Insumos'],
      ['2024-01-12', 'Servicio de internet', 'Telco Y', 8900, 'Servicios'],
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    emoji: '📦',
    description: 'Inventario: SKU, producto, cantidad, costo, precio.',
    filename: 'plantilla_stock.csv',
    headers: ['sku', 'producto', 'cantidad', 'costo_unitario', 'precio_venta'],
    sampleRows: [
      ['SKU-001', 'Producto A', 50, 800, 1500],
      ['SKU-002', 'Producto B', 12, 2700, 4500],
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    emoji: '📈',
    description: 'Performance de campañas: spend, clicks, conversiones.',
    filename: 'plantilla_marketing.csv',
    headers: ['fecha', 'campana', 'plataforma', 'spend', 'impresiones', 'clicks', 'conversiones'],
    sampleRows: [
      ['2024-01-15', 'Campaña Verano', 'Meta Ads', 50000, 120000, 2400, 48],
      ['2024-01-15', 'Campaña Verano', 'Google Ads', 30000, 85000, 1700, 32],
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    emoji: '👥',
    description: 'Base de clientes: nombre, contacto, CUIT.',
    filename: 'plantilla_clientes.csv',
    headers: ['nombre', 'cuit', 'email', 'telefono', 'ciudad'],
    sampleRows: [
      ['Cliente Ejemplo SA', '30-12345678-9', 'contacto@ejemplo.com', '+5491112345678', 'CABA'],
    ],
  },
];

export function downloadTemplate(t: Template): void {
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csvRows = [
    t.headers.join(','),
    ...t.sampleRows.map(row => row.map(escape).join(',')),
  ];
  const csvContent = '\uFEFF' + csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = t.filename;
  a.click();
  URL.revokeObjectURL(url);
}
