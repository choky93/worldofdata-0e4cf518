import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { Settings, ArrowRight, Clock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  getStaleThresholdDays,
  setUserSettings,
  clearManualOverride,
  computeAutoStaleThreshold,
  getUserSettings,
} from '@/lib/user-settings';

interface SectionToggle {
  label: string;
  description: string;
  field: string;
  getValue: (s: NonNullable<ReturnType<typeof useAuth>['companySettings']>) => boolean;
}

const sections: SectionToggle[] = [
  { label: 'Stock', description: 'Gestión de inventario y productos', field: 'has_stock', getValue: (s) => s.has_stock ?? false },
  { label: 'Marketing', description: 'Campañas de Meta Ads y Google Ads', field: 'uses_meta_ads', getValue: (s) => (s.uses_meta_ads || s.uses_google_ads) ?? false },
  { label: 'Logística', description: 'Seguimiento de envíos y entregas', field: 'has_logistics', getValue: (s) => s.has_logistics ?? false },
];

export default function Configuracion() {
  const { companyName, companySettings, profile, refreshProfile } = useAuth();
  const completion = companySettings?.onboarding_completion_pct ?? 0;
  const [updating, setUpdating] = useState<string | null>(null);

  // 2.7 / Ola 10 — Umbral de frescura (localStorage, por navegador) con modo Auto/Manual
  const [staleDays, setStaleDays] = useState<number>(() => getStaleThresholdDays());
  const [hasManualOverride, setHasManualOverride] = useState<boolean>(() => getUserSettings().hasManualOverride);
  useEffect(() => {
    setStaleDays(getStaleThresholdDays());
    setHasManualOverride(getUserSettings().hasManualOverride);
  }, []);

  // Valor que el modo "Auto" sugeriría según el perfil del negocio.
  const autoSuggested = computeAutoStaleThreshold('ventas', companySettings ?? null);

  const handleStaleChange = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    setStaleDays(n);
    setHasManualOverride(true);
    setUserSettings({ staleThresholdDays: n, hasManualOverride: true });
  };

  const handleResetAuto = () => {
    clearManualOverride();
    setHasManualOverride(false);
    setStaleDays(autoSuggested);
    toast.success('Umbral en modo automático', {
      description: `Se ajusta solo según tu perfil (sugerido: ${autoSuggested} días para ventas).`,
    });
  };

  const handleToggle = async (section: SectionToggle, checked: boolean) => {
    if (!profile?.company_id) return;
    setUpdating(section.field);

    const updateData: Record<string, boolean> = {};
    if (section.field === 'uses_meta_ads') {
      updateData.uses_meta_ads = checked;
      if (!checked) updateData.uses_google_ads = false;
    } else {
      updateData[section.field] = checked;
    }

    const { error } = await supabase
      .from('company_settings')
      .update(updateData)
      .eq('company_id', profile.company_id);

    if (error) {
      toast.error('Error al actualizar la sección');
    } else {
      toast.success(`${section.label} ${checked ? 'activada' : 'desactivada'}`);
      await refreshProfile();
    }
    setUpdating(null);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Configuración</h1>

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Perfil de empresa</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Empresa</span>
            <span className="font-medium">{companyName || 'Sin nombre'}</span>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Perfil completado</span>
              <span className="font-medium">{completion}%</span>
            </div>
            <Progress value={completion} className="h-2" />
          </div>
          <Link to="/onboarding">
            <Button variant="outline" className="w-full mt-2">
              <Settings className="h-4 w-4 mr-2" /> Editar configuración del onboarding <ArrowRight className="h-4 w-4 ml-auto" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm text-muted-foreground">Secciones visibles</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {sections.map((section) => {
            const isActive = companySettings ? section.getValue(companySettings) : false;
            const isLoading = updating === section.field;
            return (
              <div key={section.field} className="flex items-center justify-between py-2">
                <div className="space-y-0.5">
                  <Label htmlFor={section.field} className="text-sm font-medium">{section.label}</Label>
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                </div>
                <Switch
                  id={section.field}
                  checked={isActive}
                  disabled={isLoading || !companySettings}
                  onCheckedChange={(checked) => handleToggle(section, checked)}
                />
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground pt-2">Activá o desactivá secciones del menú.</p>
        </CardContent>
      </Card>

      {/* 2.7 + Ola 10 — Umbral de frescura con modo Auto/Manual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Umbral de frescura
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1 flex-1">
              <Label htmlFor="stale-threshold" className="text-sm font-medium flex items-center gap-2">
                Días para considerar datos desactualizados
                {!hasManualOverride && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-success/15 text-success">
                    <Sparkles className="h-3 w-3" /> Auto
                  </span>
                )}
              </Label>
              <p className="text-xs text-muted-foreground">
                Las pills de frescura del Dashboard se ponen en rojo cuando la última carga supera este umbral.
                {!hasManualOverride && (
                  <span> El sistema lo ajusta solo según el tipo de negocio (sugerido para ventas: <strong>{autoSuggested} días</strong>).</span>
                )}
              </p>
            </div>
            <Input
              id="stale-threshold"
              type="number"
              min={1}
              max={365}
              value={staleDays}
              onChange={(e) => handleStaleChange(e.target.value)}
              className="w-24 text-right"
            />
          </div>
          {hasManualOverride && (
            <div className="flex items-center justify-between text-xs border-t pt-3">
              <span className="text-muted-foreground">
                Estás usando un valor manual. El auto-ajuste sugeriría <strong>{autoSuggested} días</strong> para ventas.
              </span>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleResetAuto}>
                <Sparkles className="h-3 w-3 mr-1" />
                Volver a Auto
              </Button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Preferencia local (este navegador). En modo Auto, marketing y stock con inventario usan 7 días; servicios con clientes recurrentes 30.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
