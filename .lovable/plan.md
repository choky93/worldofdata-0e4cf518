

# Plan: Correcciones del Onboarding

## Problemas reportados por el cliente

1. **"¿Dónde te duele?" solo permite seleccionar una opción** — El campo `painPoint` es un string único. El cliente quiere poder elegir varias.
2. **El botón "Empezar a usar World of Data" no funciona en el paso final** — Probablemente `handleFinish` falla silenciosamente. El `upsert` en `diagnostic_results` usa `onConflict: 'company_id'` pero puede fallar si no hay un unique constraint, o el campo `painPoint` ahora sería un array y el insert falla. También, si `profile?.company_id` es null/undefined, la función retorna sin hacer nada y sin feedback.

## Cambios a implementar

### 1. Pain points: de selección única a múltiple

**Archivo:** `src/pages/Onboarding.tsx`
- Cambiar `painPoint: string` a `painPoints: string[]` en `OnboardingData`
- Inicializar como `painPoints: []`
- En el Block 0, cambiar el onClick para toggle (agregar/quitar del array)
- Actualizar el estilo para marcar múltiples seleccionados

**Archivo:** `src/lib/constants.ts`
- No requiere cambios

### 2. Actualizar handleFinish para arrays

**Archivo:** `src/pages/Onboarding.tsx`
- En `handleFinish`: cambiar `data.painPoint` a `data.painPoints` (join o primer elemento para `pain_point` en DB, o guardar como array)
- En el resultado (Block 4): usar `data.painPoints` para calcular prioridades
- Agregar `console.error` y un toast de error más descriptivo si algo falla
- Agregar validación: si `!profile?.company_id`, mostrar toast de error en vez de retornar silenciosamente

### 3. Resultado: ajustar texto de prioridades

**Archivo:** `src/pages/Onboarding.tsx`
- Block 4: las dimensiones prioritarias ahora se calculan desde `data.painPoints` (las que eligió el cliente van primero)

## Archivos modificados
- `src/pages/Onboarding.tsx`

