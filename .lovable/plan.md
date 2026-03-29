

# Toggles para habilitar/deshabilitar secciones desde Configuración

## Qué pide el cliente

Poder activar o desactivar Stock, Marketing y Logística directamente desde la página de Configuración con un switch, sin tener que volver al onboarding.

## Plan

### 1. Reemplazar los indicadores estáticos por Switch toggles

En `src/pages/Configuracion.tsx`:
- Importar el componente `Switch` y el cliente de base de datos
- Reemplazar el componente `Row` (que solo muestra "Visible"/"Oculta") por filas con un `Switch` interactivo
- Mapeo de toggles:
  - **Stock** → `has_stock`
  - **Marketing** → `uses_meta_ads` (al activar, prende meta ads; al desactivar, apaga ambos `uses_meta_ads` y `uses_google_ads`)
  - **Logística** → `has_logistics`
- Al cambiar un toggle: hacer `UPDATE` a `company_settings` y llamar `refreshProfile()` del AuthContext para que el sidebar se actualice inmediatamente
- Mostrar toast de confirmación en cada cambio
- Quitar el texto "Estas secciones se configuran según tus respuestas del onboarding" y reemplazarlo por "Activá o desactivá secciones del menú"

### 2. Archivos a modificar

Solo `src/pages/Configuracion.tsx` — no requiere migraciones ni cambios de backend (la tabla `company_settings` ya tiene las columnas y la RLS permite UPDATE a admins).

