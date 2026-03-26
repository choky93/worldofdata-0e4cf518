

# Fix: Archivos quedan en "Procesando" para siempre

## Problema
Cuando se sube un archivo, se registra en la base de datos con `status: 'processing'`, pero nada actualiza ese estado después. No hay ningún proceso que cambie el status a `'processed'` una vez que el archivo se subió exitosamente a R2.

## Solución

La forma más directa: si el upload a R2 fue exitoso (ya lo sabemos porque `r2-upload` respondió `success: true`), entonces el registro en la DB debería insertarse directamente con `status: 'processed'` en vez de `'processing'`.

### Cambio en `src/pages/CargaDatos.tsx`

En la función `uploadFiles`, cambiar la línea que inserta en `file_uploads`:

```typescript
// Antes
status: 'processing',

// Después
status: 'processed',
```

Esto es correcto porque:
- El archivo ya se subió exitosamente a R2 (confirmado por `uploadData.success`)
- No hay ningún paso de procesamiento posterior (parseo, OCR, etc.) implementado
- Si en el futuro se agrega procesamiento real (ej: extraer datos del Excel), se puede volver a usar `'processing'` y agregar un worker que lo actualice

### Archivo tocado
- `src/pages/CargaDatos.tsx` (1 línea)

