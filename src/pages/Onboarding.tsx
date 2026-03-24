import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { INDUSTRIES, EMPLOYEE_RANGES, YEARS_RANGES, SKU_RANGES, ACCOUNTING_METHODS, GOALS, APP_NAME } from '@/lib/constants';
import { BarChart3, ArrowRight, ArrowLeft, HelpCircle, Check } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface OnboardingData {
  companyName: string;
  industry: string;
  customIndustry: string;
  employeeCount: string;
  yearsOperating: string;
  sellsProducts: boolean;
  sellsServices: boolean;
  hasStock: boolean;
  hasLogistics: boolean;
  supplierLeadDays: string;
  skuCount: string;
  hasRecurringClients: boolean;
  hasWholesalePrices: boolean;
  accountingMethod: string;
  crmErp: string;
  usesMetaAds: boolean;
  usesGoogleAds: boolean;
  goals: string[];
}

const initialData: OnboardingData = {
  companyName: '', industry: '', customIndustry: '', employeeCount: '', yearsOperating: '',
  sellsProducts: false, sellsServices: false, hasStock: false, hasLogistics: false,
  supplierLeadDays: '', skuCount: '', hasRecurringClients: false, hasWholesalePrices: false,
  accountingMethod: '', crmErp: '', usesMetaAds: false, usesGoogleAds: false, goals: [],
};

function HelpTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-4 w-4 text-muted-foreground inline-block ml-1 cursor-help" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs"><p className="text-sm">{text}</p></TooltipContent>
    </Tooltip>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [saving, setSaving] = useState(false);
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  // Pre-load existing data when editing from Configuración
  useEffect(() => {
    const loadExisting = async () => {
      if (!profile?.company_id) return;
      try {
        const { data: company } = await supabase
          .from('companies')
          .select('name, industry, employee_count, years_operating')
          .eq('id', profile.company_id)
          .single();

        const { data: settings } = await supabase
          .from('company_settings')
          .select('*')
          .eq('company_id', profile.company_id)
          .single();

        if (company || settings) {
          const isCustomIndustry = company?.industry && !INDUSTRIES.includes(company.industry);
          setData(prev => ({
            ...prev,
            companyName: company?.name || prev.companyName,
            industry: isCustomIndustry ? 'Otro' : (company?.industry || prev.industry),
            customIndustry: isCustomIndustry ? (company?.industry || '') : prev.customIndustry,
            employeeCount: company?.employee_count || prev.employeeCount,
            yearsOperating: company?.years_operating || prev.yearsOperating,
            sellsProducts: settings?.sells_products ?? prev.sellsProducts,
            sellsServices: settings?.sells_services ?? prev.sellsServices,
            hasStock: settings?.has_stock ?? prev.hasStock,
            hasLogistics: settings?.has_logistics ?? prev.hasLogistics,
            supplierLeadDays: settings?.supplier_lead_days?.toString() || prev.supplierLeadDays,
            skuCount: settings?.sku_count || prev.skuCount,
            hasRecurringClients: settings?.has_recurring_clients ?? prev.hasRecurringClients,
            hasWholesalePrices: settings?.has_wholesale_prices ?? prev.hasWholesalePrices,
            accountingMethod: settings?.accounting_method || prev.accountingMethod,
            crmErp: settings?.crm_erp || prev.crmErp,
            usesMetaAds: settings?.uses_meta_ads ?? prev.usesMetaAds,
            usesGoogleAds: settings?.uses_google_ads ?? prev.usesGoogleAds,
            goals: (settings?.goals as string[]) || prev.goals,
          }));
        }
      } catch (err) {
        console.error('Error loading existing data:', err);
      }
    };
    loadExisting();
  }, [profile?.company_id]);

  const totalSteps = 5; // 4 blocks + summary
  const progress = ((step + 1) / totalSteps) * 100;

  const update = (fields: Partial<OnboardingData>) => setData((d) => ({ ...d, ...fields }));

  const handleFinish = async () => {
    if (!profile?.company_id) return;
    setSaving(true);
    try {
      await supabase.from('companies').update({
        name: data.companyName,
        industry: data.industry === 'Otro' ? data.customIndustry : data.industry,
        employee_count: data.employeeCount,
        years_operating: data.yearsOperating,
      }).eq('id', profile.company_id);

      await supabase.from('company_settings').update({
        sells_products: data.sellsProducts,
        sells_services: data.sellsServices,
        has_stock: data.hasStock,
        has_logistics: data.hasLogistics,
        supplier_lead_days: data.supplierLeadDays ? parseInt(data.supplierLeadDays) : null,
        sku_count: data.skuCount,
        has_recurring_clients: data.hasRecurringClients,
        has_wholesale_prices: data.hasWholesalePrices,
        accounting_method: data.accountingMethod,
        crm_erp: data.crmErp,
        uses_meta_ads: data.usesMetaAds,
        uses_google_ads: data.usesGoogleAds,
        goals: data.goals,
        onboarding_completed: true,
        onboarding_completion_pct: 100,
      }).eq('company_id', profile.company_id);

      await refreshProfile();
      toast.success('¡Configuración completada!');
      navigate('/');
    } catch {
      toast.error('Error al guardar. Intentá de nuevo.');
    }
    setSaving(false);
  };

  const blocks = [
    // Block 0: Datos del negocio
    <div key="b1" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Contanos sobre tu negocio</h2>
        <p className="text-sm text-muted-foreground">Esta información nos ayuda a personalizar tu experiencia.</p>
      </div>
      <div className="space-y-2">
        <Label>Nombre de la empresa</Label>
        <Input value={data.companyName} onChange={(e) => update({ companyName: e.target.value })} placeholder="Ej: Mi Empresa SRL" />
      </div>
      <div className="space-y-2">
        <Label>Rubro / Industria</Label>
        <div className="grid grid-cols-2 gap-2">
          {INDUSTRIES.map((ind) => (
            <Button key={ind} type="button" variant={data.industry === ind ? 'default' : 'outline'} className="justify-start h-auto py-2 px-3 text-sm"
              onClick={() => update({ industry: ind })}>
              {ind}
            </Button>
          ))}
        </div>
        {data.industry === 'Otro' && (
          <Input value={data.customIndustry} onChange={(e) => update({ customIndustry: e.target.value })} placeholder="¿Cuál?" className="mt-2" />
        )}
      </div>
      <div className="space-y-2">
        <Label>¿Cuántos empleados tiene tu empresa?</Label>
        <RadioGroup value={data.employeeCount} onValueChange={(v) => update({ employeeCount: v })}>
          {EMPLOYEE_RANGES.map((r) => (
            <div key={r} className="flex items-center space-x-2">
              <RadioGroupItem value={r} id={`emp-${r}`} />
              <Label htmlFor={`emp-${r}`} className="font-normal">{r}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <div className="space-y-2">
        <Label>¿Hace cuánto opera tu empresa?</Label>
        <RadioGroup value={data.yearsOperating} onValueChange={(v) => update({ yearsOperating: v })}>
          {YEARS_RANGES.map((r) => (
            <div key={r} className="flex items-center space-x-2">
              <RadioGroupItem value={r} id={`yr-${r}`} />
              <Label htmlFor={`yr-${r}`} className="font-normal">{r}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>,

    // Block 1: Modelo de negocio
    <div key="b2" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Tu modelo de negocio</h2>
        <p className="text-sm text-muted-foreground">Esto configura qué secciones vas a ver en tu tablero.</p>
      </div>
      <div className="space-y-3">
        <Label>¿Qué vendés?</Label>
        <div className="flex gap-3">
          <Button type="button" variant={data.sellsProducts ? 'default' : 'outline'} onClick={() => update({ sellsProducts: !data.sellsProducts })}>Productos</Button>
          <Button type="button" variant={data.sellsServices ? 'default' : 'outline'} onClick={() => update({ sellsServices: !data.sellsServices })}>Servicios</Button>
        </div>
      </div>
      {data.sellsProducts && (
        <>
          <div className="space-y-2">
            <Label>¿Manejás stock/inventario? <HelpTip text="Si tenés productos que comprás y almacenás para vender, activá esta opción. Vamos a agregar una sección de stock a tu tablero." /></Label>
            <div className="flex gap-3">
              <Button type="button" variant={data.hasStock ? 'default' : 'outline'} onClick={() => update({ hasStock: true })}>Sí</Button>
              <Button type="button" variant={!data.hasStock ? 'default' : 'outline'} onClick={() => update({ hasStock: false })}>No</Button>
            </div>
          </div>
          {data.hasStock && (
            <>
              <div className="space-y-2">
                <Label>¿Tenés logística de envíos?</Label>
                <div className="flex gap-3">
                  <Button type="button" variant={data.hasLogistics ? 'default' : 'outline'} onClick={() => update({ hasLogistics: true })}>Sí</Button>
                  <Button type="button" variant={!data.hasLogistics ? 'default' : 'outline'} onClick={() => update({ hasLogistics: false })}>No</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>¿Cuánto tarda tu proveedor principal en entregar? (días)</Label>
                <Input type="number" value={data.supplierLeadDays} onChange={(e) => update({ supplierLeadDays: e.target.value })} placeholder="Ej: 15" />
              </div>
              <div className="space-y-2">
                <Label>¿Cuántos productos/SKUs manejás?</Label>
                <RadioGroup value={data.skuCount} onValueChange={(v) => update({ skuCount: v })}>
                  {SKU_RANGES.map((r) => (
                    <div key={r} className="flex items-center space-x-2">
                      <RadioGroupItem value={r} id={`sku-${r}`} />
                      <Label htmlFor={`sku-${r}`} className="font-normal">{r}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </>
          )}
        </>
      )}
      <div className="space-y-2">
        <Label>¿Tenés clientes recurrentes? <HelpTip text="Si los mismos clientes te compran regularmente, podemos hacer seguimiento de su comportamiento." /></Label>
        <div className="flex gap-3">
          <Button type="button" variant={data.hasRecurringClients ? 'default' : 'outline'} onClick={() => update({ hasRecurringClients: true })}>Sí</Button>
          <Button type="button" variant={!data.hasRecurringClients ? 'default' : 'outline'} onClick={() => update({ hasRecurringClients: false })}>No</Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label>¿Manejás lista de precios mayorista?</Label>
        <div className="flex gap-3">
          <Button type="button" variant={data.hasWholesalePrices ? 'default' : 'outline'} onClick={() => update({ hasWholesalePrices: true })}>Sí</Button>
          <Button type="button" variant={!data.hasWholesalePrices ? 'default' : 'outline'} onClick={() => update({ hasWholesalePrices: false })}>No</Button>
        </div>
      </div>
    </div>,

    // Block 2: Herramientas
    <div key="b3" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Tus herramientas actuales</h2>
        <p className="text-sm text-muted-foreground">Saber qué usás hoy nos ayuda a facilitarte la transición.</p>
      </div>
      <div className="space-y-2">
        <Label>¿Cómo llevás las cuentas hoy?</Label>
        <RadioGroup value={data.accountingMethod} onValueChange={(v) => update({ accountingMethod: v })}>
          {ACCOUNTING_METHODS.map((m) => (
            <div key={m} className="flex items-center space-x-2">
              <RadioGroupItem value={m} id={`acc-${m}`} />
              <Label htmlFor={`acc-${m}`} className="font-normal">{m}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <div className="space-y-2">
        <Label>¿Usás algún sistema de gestión (CRM, ERP)?</Label>
        <Input value={data.crmErp} onChange={(e) => update({ crmErp: e.target.value })} placeholder="Ej: Contabilium, Xubio, ninguno..." />
      </div>
      <div className="space-y-3">
        <Label>¿Invertís en publicidad online? <HelpTip text="Si hacés campañas en Meta o Google, podemos mostrarte el rendimiento de tu inversión." /></Label>
        <div className="flex gap-3">
          <Button type="button" variant={data.usesMetaAds ? 'default' : 'outline'} onClick={() => update({ usesMetaAds: !data.usesMetaAds })}>Meta Ads</Button>
          <Button type="button" variant={data.usesGoogleAds ? 'default' : 'outline'} onClick={() => update({ usesGoogleAds: !data.usesGoogleAds })}>Google Ads</Button>
        </div>
      </div>
    </div>,

    // Block 3: Objetivos
    <div key="b4" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">¿Qué querés lograr?</h2>
        <p className="text-sm text-muted-foreground">Seleccioná todo lo que aplique. Esto prioriza lo que vas a ver primero.</p>
      </div>
      <div className="space-y-3">
        {GOALS.map((goal) => (
          <div key={goal} className="flex items-start space-x-3">
            <Checkbox
              id={goal}
              checked={data.goals.includes(goal)}
              onCheckedChange={(checked) => {
                if (goal === 'Todo lo anterior' && checked) {
                  update({ goals: [...GOALS] });
                } else if (goal === 'Todo lo anterior' && !checked) {
                  update({ goals: [] });
                } else {
                  update({
                    goals: checked
                      ? [...data.goals.filter((g) => g !== 'Todo lo anterior'), goal]
                      : data.goals.filter((g) => g !== goal),
                  });
                }
              }}
            />
            <Label htmlFor={goal} className="font-normal leading-snug cursor-pointer">{goal}</Label>
          </div>
        ))}
      </div>
    </div>,

    // Summary
    <div key="summary" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Resumen de configuración</h2>
        <p className="text-sm text-muted-foreground">Revisá que todo esté bien. Podés modificarlo después desde Configuración.</p>
      </div>
      <div className="space-y-4 text-sm">
        <SummaryRow label="Empresa" value={data.companyName || '—'} />
        <SummaryRow label="Rubro" value={data.industry === 'Otro' ? data.customIndustry : data.industry || '—'} />
        <SummaryRow label="Empleados" value={data.employeeCount || '—'} />
        <SummaryRow label="Antigüedad" value={data.yearsOperating || '—'} />
        <SummaryRow label="Vende" value={[data.sellsProducts && 'Productos', data.sellsServices && 'Servicios'].filter(Boolean).join(' y ') || '—'} />
        {data.sellsProducts && <SummaryRow label="Maneja stock" value={data.hasStock ? 'Sí' : 'No'} />}
        <SummaryRow label="Publicidad" value={[data.usesMetaAds && 'Meta', data.usesGoogleAds && 'Google'].filter(Boolean).join(' y ') || 'No invierte'} />
        <SummaryRow label="Objetivos" value={data.goals.length > 0 ? `${data.goals.length} seleccionados` : '—'} />
      </div>
      <div className="bg-muted/50 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          <Check className="h-4 w-4 inline mr-1 text-success" />
          Tu dashboard se va a configurar con las secciones que necesitás.
          {!data.hasStock && ' La sección de Stock no se mostrará.'}
          {!data.usesMetaAds && !data.usesGoogleAds && ' La sección de Marketing no se mostrará.'}
        </p>
      </div>
    </div>,
  ];

  return (
    <TooltipProvider>
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-xl">
          <div className="text-center mb-6">
            <div className="mx-auto h-10 w-10 rounded-xl bg-primary flex items-center justify-center mb-3">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Paso {step + 1} de {totalSteps}</p>
            <Progress value={progress} className="mt-2 h-1.5" />
          </div>

          <Card className="shadow-xl border-0">
            <CardContent className="pt-6 pb-4 px-6">
              {blocks[step]}
            </CardContent>
          </Card>

          <div className="flex justify-between mt-4">
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Atrás
            </Button>
            {step < totalSteps - 1 ? (
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(step + 1)} className="text-muted-foreground">
                  Saltar
                </Button>
                <Button onClick={() => setStep(step + 1)}>
                  Siguiente <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            ) : (
              <Button onClick={handleFinish} disabled={saving}>
                {saving ? 'Guardando...' : 'Confirmar y empezar'} <Check className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
