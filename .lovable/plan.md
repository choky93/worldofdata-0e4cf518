

# World of Data — Plan de Implementación Fundacional

## Visión General
Dashboard empresarial SaaS para PyMEs argentinas. Un "socio inteligente" que centraliza datos del negocio y ofrece visibilidad, alertas y pronósticos. Primera versión con datos de ejemplo de "Star Impresiones 3D".

---

## 1. Autenticación y Roles (Supabase)

- **Registro admin**: email + contraseña → verificación → onboarding
- **Login**: detección de rol, redirección según tipo (admin → dashboard, empleado → ingesta)
- **Tabla `user_roles`** con enum `admin | employee` y función `has_role()` con SECURITY DEFINER
- **Tabla `profiles`**: nombre, empresa asociada
- **Tabla `companies`**: datos del negocio (nombre, rubro, configuración del onboarding)
- **RLS**: empleados solo acceden a sus propias cargas; admins ven todo de su empresa
- **Página de reset de contraseña** en `/reset-password`

## 2. Onboarding Conversacional

- Pantalla centrada (600px), estilo "focus mode" con animaciones suaves
- **4 bloques de preguntas** con lógica condicional:
  - Bloque 1: Datos del negocio (nombre, rubro, empleados, antigüedad)
  - Bloque 2: Modelo de negocio (productos/servicios, stock, logística, clientes recurrentes, precios mayoristas) — preguntas se adaptan según respuestas
  - Bloque 3: Herramientas actuales (contabilidad, CRM, ads)
  - Bloque 4: Objetivos (multi-selección)
- Barra de progreso superior, tooltips explicativos
- Guardado en tabla `company_settings` → configura qué secciones se muestran
- Resumen final editable antes de confirmar
- Posibilidad de saltar preguntas y completar después

## 3. Dashboard Principal

Pantalla del admin post-onboarding con datos mock de "Star Impresiones 3D":

- **Barra resumen inteligente** (ticker superior): highlights clave en texto rotativo
- **Saludo + Resumen Ejecutivo**: "Buen día, Roberto. Acá va tu resumen de Star Impresiones 3D" + 2-3 líneas de insights
- **Cards principales** (grid responsive):
  - **Ventas del Mes**: acumulado, estimación, gráfico de progreso, desglose diario/semanal
  - **Ganancia**: neta, desglose (ventas - costos variables - fijos), margen %, comparación vs anterior
  - **Flujo de Caja**: disponible hoy, proyección fin de mes, gauge verde/amarillo/rojo
  - **Inversión Publicitaria** (condicional): gasto en ads, ROAS, comparación
  - **Gastos Previstos**: lista con montos, vencimientos, estados
  - **Stock Consolidado** (condicional): top productos con semáforo 🟢🟡🔴, acciones recomendadas
  - **Clientes**: cobros pendientes, top 3 clientes, producto estrella, alerta concentración

## 4. Sidebar y Navegación

- Sidebar `w-64` con `collapsible="icon"`, usando componente Shadcn Sidebar
- Secciones: Dashboard, Ventas, Finanzas, Stock*, Clientes, Forecast, Alertas (con badge), Métricas, Marketing*, Operaciones, Carga de datos, Equipo, Configuración
- *Condicionales según `company_settings`
- Empleados solo ven "Carga de datos" y "Logout"
- Mobile: sidebar como menú hamburguesa

## 5. Páginas de Sección (con datos de ejemplo)

Cada una con estructura, gráficos (Recharts) y datos mock:

- **Ventas**: historial, gráficos de barras/líneas, filtros por período, tabla detallada
- **Finanzas**: presupuesto financiero (devengado) vs económico (caja), vista comparativa
- **Stock**: inventario completo, semáforo por producto, proveedores, margen bruto
- **Clientes**: listado, historial de compras, cobros pendientes, análisis de cartera
- **Forecast**: pronóstico mensual/trimestral, gráficos con línea punteada para proyección, confianza alta/media/baja
- **Alertas**: lista priorizada con íconos por tipo, acciones recomendadas, marcar como vista/resuelta
- **Métricas**: evolución temporal de ventas, margen, flujo, stock — con flechas de tendencia
- **Marketing**: rendimiento de ads por campaña, ROAS
- **Operaciones**: registro de compras/ventas grandes

## 6. Carga de Datos (Ingesta)

- **Dropzone** drag & drop (PDF, CSV, XLS/XLSX, imágenes)
- Lista de archivos: nombre, tipo detectado, fecha, estado (procesando/procesado/error), quién subió
- **Asistente lateral**: guía contextual de qué archivos cargar
- **Historial de cargas** con opción de eliminar
- **Vista empleado**: simplificada, solo su zona de carga y su historial personal
- Almacenamiento en Supabase Storage

## 7. Gestión de Equipo

- Página "Equipo" (solo admin)
- Crear empleado: nombre + email → contraseña temporal generada
- Lista de empleados con actividad de carga
- Desactivar/eliminar cuentas

## 8. Configuración

- Editar datos del onboarding (re-configura secciones visibles)
- Indicador de "perfil completado al X%"
- Preferencias de la empresa

## 9. Diseño y UX

- **Tipografía**: Inter variable, `-0.02em` tracking en headings, `tabular-nums` para números
- **Colores**: fondo `HSL(210, 40%, 98%)`, foreground deep navy, primary executive blue, success emerald, warning amber
- **Cards**: sin bordes sólidos, sombras por capas, `rounded-xl` exterior / `rounded-lg` interior
- **Formato argentino**: `$1.240.000,00`, fechas DD/MM/AAAA, moneda ARS
- **Tooltips** en métricas técnicas (ROAS, margen, etc.)
- **Alertas**: borde izquierdo de color por tipo, botón ghost "Ver sugerencia →"
- **Gráficos**: Recharts, área con gradient fill, proyección en `stroke-dasharray`

## 10. Datos Mock — Star Impresiones 3D

- Empresa de impresiones 3D con productos (impresoras, filamentos, repuestos, servicios)
- 12 meses de datos de ventas ($800K - $2.5M/mes)
- Stock variado (sobrestock, faltante, OK)
- 8-10 clientes con diferentes niveles
- Alertas de ejemplo realistas
- Gastos fijos y variables de ejemplo

