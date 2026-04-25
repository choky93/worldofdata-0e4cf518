import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { suggestCategory } from '@/lib/schema-preview';

export interface SchemaPreviewPayload {
  fileName: string;
  headers: string[];
  rows: Record<string, unknown>[]; // first ~20 sample rows
  totalRows: number;
}

interface Props {
  open: boolean;
  payload: SchemaPreviewPayload | null;
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  categoryLabels: Record<string, string>;
}

const CATEGORY_OPTIONS = ['ventas', 'gastos', 'stock', 'facturas', 'marketing', 'clientes', 'rrhh', 'otro'];

/**
 * Schema Preview & Confirmation modal (Audit feature 5.1).
 *
 * Shows the user the FIRST ~20 rows + parsed headers + a heuristic category
 * suggestion BEFORE the file is sent to the edge function. The user can:
 *   - confirm the auto-detected category, or
 *   - override with a manual choice (sent as `explicitCategory` to the
 *     edge function, bypassing AI classification),
 *   - cancel and remove the file from the queue.
 *
 * This catches the most common upload bug class: file looks fine, AI
 * misclassifies it, user only notices days later in the dashboard.
 */
export function SchemaPreviewDialog({
  open, payload, selectedCategory, onCategoryChange, onConfirm, onCancel, categoryLabels,
}: Props) {
  const suggestion = useMemo(() => {
    if (!payload) return null;
    return suggestCategory(payload.headers);
  }, [payload]);

  if (!payload) return null;

  const previewRows = payload.rows.slice(0, 20);
  const confidencePct = Math.round((suggestion?.confidence ?? 0) * 100);
  const confidenceColor = confidencePct >= 50 ? 'bg-green-500/10 text-green-700 dark:text-green-400'
    : confidencePct >= 25 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
    : 'bg-red-500/10 text-red-700 dark:text-red-400';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🔍 Vista previa: <span className="font-mono text-base truncate">{payload.fileName}</span>
          </DialogTitle>
          <DialogDescription>
            Confirmá la categoría detectada y revisá las primeras filas antes de procesar.
            {payload.totalRows > previewRows.length && (
              <> Se procesarán <strong>{payload.totalRows.toLocaleString('es-AR')}</strong> filas en total.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          {/* Category suggestion */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Categoría sugerida</label>
            <div className="flex items-center gap-2">
              <Select value={selectedCategory} onValueChange={onCategoryChange}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(c => (
                    <SelectItem key={c} value={c}>{categoryLabels[c] || c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {suggestion && (
                <Badge variant="secondary" className={confidenceColor}>
                  {confidencePct}% match
                </Badge>
              )}
            </div>
            {suggestion && suggestion.matchedTokens.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Detectado por: <span className="font-mono">{suggestion.matchedTokens.slice(0, 5).join(', ')}</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Resumen</label>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>📋 Columnas: <strong>{payload.headers.length}</strong></div>
              <div>📊 Filas totales: <strong>{payload.totalRows.toLocaleString('es-AR')}</strong></div>
              <div>👁️ Mostrando primeras <strong>{previewRows.length}</strong></div>
            </div>
          </div>
        </div>

        {/* Preview table */}
        <div className="flex-1 overflow-auto border rounded-md">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/95 backdrop-blur z-10">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground border-b w-10">#</th>
                {payload.headers.map((h, i) => (
                  <th key={i} className="text-left px-2 py-1.5 font-medium border-b whitespace-nowrap">{h || <em className="text-muted-foreground">(sin nombre)</em>}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, ri) => (
                <tr key={ri} className="hover:bg-muted/40">
                  <td className="px-2 py-1 text-muted-foreground font-mono">{ri + 1}</td>
                  {payload.headers.map((h, ci) => {
                    const v = row[h];
                    const display = v === null || v === undefined || v === '' ? '—' : String(v);
                    return (
                      <td key={ci} className="px-2 py-1 max-w-[200px] truncate" title={display}>
                        {display === '—' ? <span className="text-muted-foreground">—</span> : display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onConfirm}>Confirmar y procesar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
