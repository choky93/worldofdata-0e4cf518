/**
 * MultiSheetPickerDialog (Ola 12).
 *
 * Cuando un Excel viene con varias hojas válidas, este dialog le permite
 * al usuario elegir cuáles procesar antes de mandar al backend.
 *
 * - Default: TODAS las hojas seleccionadas.
 * - Botón "Procesar todas" como atajo común.
 * - Lista de checkboxes con nombre + cantidad de filas + preview de headers.
 * - "Cancelar" aborta el upload (devuelve null).
 *
 * Patrón de uso (CargaDatos.tsx):
 *   const selected = await openSheetPicker(sheets); // resuelve con string[] | null
 *   if (selected === null) return; // canceló
 *   if (selected.length === 0) toast('Sin hojas seleccionadas');
 */

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, FileSpreadsheet } from 'lucide-react';

export interface SheetInfo {
  name: string;
  rows: number;
  headers: string[];
}

interface Props {
  open: boolean;
  fileName: string;
  sheets: SheetInfo[];
  onConfirm: (selected: string[]) => void;
  onCancel: () => void;
}

export function MultiSheetPickerDialog({ open, fileName, sheets, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(sheets.map(s => s.name)));

  // Reset cuando cambia la lista de hojas
  React.useEffect(() => {
    setSelected(new Set(sheets.map(s => s.name)));
  }, [sheets]);

  const toggle = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const allSelected = sheets.length > 0 && selected.size === sheets.length;
  const noneSelected = selected.size === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Detectamos varias hojas
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{fileName}</span> tiene <strong>{sheets.length} hojas con datos</strong>.
            Elegí cuáles querés procesar. Cada hoja se carga por separado con su propia categoría detectada.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 border-y">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSelected(allSelected ? new Set() : new Set(sheets.map(s => s.name)))}
          >
            {allSelected ? 'Desmarcar todas' : 'Marcar todas'}
          </Button>
          <span className="text-xs text-muted-foreground">
            {selected.size} de {sheets.length} hoja(s)
          </span>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          <ul className="divide-y">
            {sheets.map((s) => {
              const isOn = selected.has(s.name);
              return (
                <li key={s.name} className="flex items-start gap-3 py-2.5 px-1">
                  <Checkbox
                    id={`sheet-${s.name}`}
                    checked={isOn}
                    onCheckedChange={() => toggle(s.name)}
                    className="mt-0.5"
                  />
                  <label htmlFor={`sheet-${s.name}`} className="flex-1 cursor-pointer min-w-0">
                    <div className="flex items-center gap-2">
                      <Sheet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {s.rows.toLocaleString('es-AR')} filas
                      </span>
                    </div>
                    {s.headers.length > 0 && (
                      <div className="text-[11px] text-muted-foreground mt-1 truncate">
                        Columnas: <span className="font-mono">{s.headers.slice(0, 6).join(', ')}{s.headers.length > 6 ? `, +${s.headers.length - 6} más` : ''}</span>
                      </div>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={() => onConfirm(Array.from(selected))} disabled={noneSelected}>
            Procesar {selected.size === sheets.length ? 'todas' : `${selected.size} hoja${selected.size === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
