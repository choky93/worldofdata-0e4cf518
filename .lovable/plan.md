
# Plan: corregir sidebar móvil que sigue mostrando solo íconos

## Diagnóstico
El problema no parece ser ya el breakpoint, sino la lógica de colapsado dentro del contenido del sidebar:

- `useIsMobile` ya está en `1024`, así que en móvil/tablet el sidebar debería abrirse como overlay.
- Pero `AppSidebar` usa `const collapsed = state === 'collapsed'`.
- En `AppLayout`, `SidebarProvider` arranca con `defaultOpen={false}`.
- En móvil, aunque el sidebar se abra como `Sheet`, el `state` general sigue siendo `"collapsed"`, entonces el contenido renderiza solo íconos y oculta los textos.

Eso coincide exactamente con la captura: se abre como panel, pero internamente sigue “mini”.

## Cambios a implementar

### 1. Forzar sidebar expandido en móvil
**Archivo:** `src/components/AppSidebar.tsx`

- Leer también `isMobile` desde `useSidebar()`
- Cambiar la lógica a algo como:
  - `const collapsed = !isMobile && state === 'collapsed'`
- Así, en móvil:
  - siempre se muestran nombre/logo
  - siempre se muestran labels de navegación
  - siempre se muestran badges
  - el botón “Cerrar sesión” muestra texto

## 2. Revisar ancho y espaciado del panel móvil
**Archivo:** `src/components/ui/sidebar.tsx`

Ajustar el `SheetContent` móvil para que:
- no se vea sobredimensionado innecesariamente
- tenga un ancho más razonable en celulares pequeños
- conserve buena legibilidad del texto

Posibles ajustes:
- bajar levemente `SIDEBAR_WIDTH_MOBILE`
- o usar un ancho responsive tipo `w-[85vw] max-w-[18rem]`

## 3. Mejorar UX del menú móvil
**Archivo:** `src/components/AppSidebar.tsx`

- Hacer que al tocar una opción del menú en móvil, el sidebar se cierre automáticamente
- Evita que el usuario quede con el panel abierto encima del contenido

## 4. Revisión visual global en móvil
Aprovechar esta corrección para validar que:
- header + trigger sigan visibles
- el logo no desborde
- los nombres largos como “Carga de datos” y “Configuración” entren bien
- el footer no quede cortado
- el overlay no tape de forma extraña el contenido de fondo

## Resultado esperado
En celular/tablet, al abrir el sidebar:
- se verá como menú completo, no mini
- aparecerán íconos + nombres
- ocupará un ancho razonable
- se podrá navegar con claridad sin perder demasiado espacio

## Archivos a tocar
- `src/components/AppSidebar.tsx`
- `src/components/ui/sidebar.tsx`

## Nota técnica
El bug central está en mezclar:
- estado de sidebar desktop (`expanded/collapsed`)
- con render del contenido móvil

La solución correcta es desacoplar ambas cosas: en móvil el sidebar puede abrirse/cerrarse, pero cuando está abierto debe renderizarse siempre en modo expandido.
