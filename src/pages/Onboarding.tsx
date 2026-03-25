import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  INDUSTRIES, EMPLOYEE_RANGES, YEARS_RANGES, SKU_RANGES, ACCOUNTING_METHODS, GOALS,
  PAIN_POINTS, MATURITY_QUESTIONS, MATURITY_LABELS,
  getMaturityClassification, getImprovementPotential,
  type MaturityClassification,
} from '@/lib/constants';
import { BarChart3, ArrowRight, ArrowLeft, HelpCircle, Check, Sparkles, Target, Zap } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingData {
  // Strategic
  painPoints: string[];
  maturityScores: Record<string, number>;
  // Operational
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
  painPoints: [], maturityScores: {},
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

// ─── Step Wrapper with animation ─────────────────────────────────────
function StepWrapper({ children, stepKey }: { children: React.ReactNode; stepKey: number }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -30 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [saving, setSaving] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  // Pre-load existing data
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
          const isCustomIndustry = company?.industry && !(INDUSTRIES as readonly string[]).includes(company.industry);
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

  const totalSteps = 5;
  const progress = ((step + 1) / totalSteps) * 100;
  const update = (fields: Partial<OnboardingData>) => setData((d) => ({ ...d, ...fields }));

  // Compute maturity
  const scores = Object.values(data.maturityScores);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const classification = getMaturityClassification(avgScore);
  const maturityInfo = MATURITY_LABELS[classification];
  const improvement = getImprovementPotential(classification);

  const handleFinish = async () => {
    if (!profile?.company_id) {
      toast.error('No se encontró tu empresa. Cerrá sesión e intentá de nuevo.');
      return;
    }
    setSaving(true);
    try {
      const { error: companyError } = await supabase.from('companies').update({
        name: data.companyName,
        industry: data.industry === 'Otro' ? data.customIndustry : data.industry,
        employee_count: data.employeeCount,
        years_operating: data.yearsOperating,
      }).eq('id', profile.company_id);

      if (companyError) {
        console.error('Error updating company:', companyError);
        throw companyError;
      }

      const { error: settingsError } = await supabase.from('company_settings').update({
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

      if (settingsError) {
        console.error('Error updating settings:', settingsError);
        throw settingsError;
      }

      // Save diagnostic result — painPoints is now an array
      const selectedPains = PAIN_POINTS.filter(p => data.painPoints.includes(p.id));
      const priorityDimensions = [
        ...selectedPains.map(p => p.dimension),
        ...PAIN_POINTS.filter(p => !data.painPoints.includes(p.id)).slice(0, 3 - selectedPains.length).map(p => p.dimension),
      ].slice(0, 3);

      const { error: diagError } = await supabase.from('diagnostic_results').upsert({
        company_id: profile.company_id,
        pain_point: data.painPoints.join(','),
        maturity_classification: classification,
        maturity_scores: data.maturityScores,
        potential_improvement_pct: improvement,
        priority_indicators: priorityDimensions,
      }, { onConflict: 'company_id' });

      if (diagError) {
        console.error('Error saving diagnostic:', diagError);
        throw diagError;
      }

      await refreshProfile();
      toast.success('¡Diagnóstico completado!');
      navigate('/dashboard');
    } catch (err) {
      console.error('Onboarding finish error:', err);
      toast.error('Error al guardar. Intentá de nuevo.');
    }
    setSaving(false);
  };

  const stepTitles = [
    { icon: <Target className="h-5 w-5" />, label: 'Diagnóstico' },
    { icon: <Zap className="h-5 w-5" />, label: 'Madurez' },
    { icon: <BarChart3 className="h-5 w-5" />, label: 'Tu negocio' },
    { icon: <Sparkles className="h-5 w-5" />, label: 'Objetivos' },
    { icon: <Check className="h-5 w-5" />, label: 'Resultado' },
  ];

  const blocks = [
    // Block 0: ¿Dónde te duele?
    <div key="pain" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-1">¿Dónde te duele hoy?</h2>
        <p className="text-sm text-muted-foreground">Elegí la problemática que más sentís en tu negocio. Esto nos ayuda a priorizar.</p>
      </div>
      <div className="grid gap-2">
        {PAIN_POINTS.map((pain) => (
          <button
            key={pain.id}
            onClick={() => {
              const current = data.painPoints;
              const updated = current.includes(pain.id)
                ? current.filter(id => id !== pain.id)
                : [...current, pain.id];
              update({ painPoints: updated });
            }}
            className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
              data.painPoints.includes(pain.id)
                ? 'border-primary bg-primary/[0.06] shadow-md'
                : 'border-border/60 hover:border-primary/40 hover:bg-muted/30'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{pain.icon}</span>
              <span className="text-sm font-medium">{pain.label}</span>
              {data.painPoints.includes(pain.id) && <Check className="h-4 w-4 text-primary ml-auto" />}
            </div>
          </button>
        ))}
      </div>
    </div>,

    // Block 1: Nivel de madurez
    <div key="maturity" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-1">¿En qué nivel está tu empresa?</h2>
        <p className="text-sm text-muted-foreground">3 preguntas rápidas para entender tu punto de partida.</p>
      </div>
      {MATURITY_QUESTIONS.map((q) => (
        <div key={q.id} className="space-y-3">
          <Label className="text-sm font-semibold">{q.question}</Label>
          <div className="grid gap-2">
            {q.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update({ maturityScores: { ...data.maturityScores, [q.id]: opt.value } })}
                className={`text-left px-4 py-3 rounded-lg border transition-all text-sm ${
                  data.maturityScores[q.id] === opt.value
                    ? 'border-primary bg-primary/[0.06] font-medium'
                    : 'border-border/60 hover:border-primary/30'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>,

    // Block 2: Datos del negocio (compactado)
    <div key="business" className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-1">Datos de tu negocio</h2>
        <p className="text-sm text-muted-foreground">Configuramos tu tablero según tu operación.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Nombre de la empresa</Label>
          <Input value={data.companyName} onChange={(e) => update({ companyName: e.target.value })} placeholder="Ej: Mi Empresa SRL" />
        </div>
        <div className="space-y-2">
          <Label>Rubro</Label>
          <div className="flex flex-wrap gap-1.5">
            {INDUSTRIES.map((ind) => (
              <Button key={ind} type="button" size="sm" variant={data.industry === ind ? 'default' : 'outline'}
                className="h-8 text-xs" onClick={() => update({ industry: ind })}>
                {ind}
              </Button>
            ))}
          </div>
          {data.industry === 'Otro' && (
            <Input value={data.customIndustry} onChange={(e) => update({ customIndustry: e.target.value })} placeholder="¿Cuál?" className="mt-1" />
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Empleados</Label>
          <div className="flex flex-wrap gap-1.5">
            {EMPLOYEE_RANGES.map((r) => (
              <Button key={r} type="button" size="sm" variant={data.employeeCount === r ? 'default' : 'outline'}
                className="h-8 text-xs" onClick={() => update({ employeeCount: r })}>
                {r}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Antigüedad</Label>
          <div className="flex flex-wrap gap-1.5">
            {YEARS_RANGES.map((r) => (
              <Button key={r} type="button" size="sm" variant={data.yearsOperating === r ? 'default' : 'outline'}
                className="h-8 text-xs" onClick={() => update({ yearsOperating: r })}>
                {r}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-1">
        <Label className="font-semibold">¿Qué vendés?</Label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={data.sellsProducts ? 'default' : 'outline'} onClick={() => update({ sellsProducts: !data.sellsProducts })}>Productos</Button>
          <Button type="button" size="sm" variant={data.sellsServices ? 'default' : 'outline'} onClick={() => update({ sellsServices: !data.sellsServices })}>Servicios</Button>
        </div>
      </div>

      {data.sellsProducts && (
        <div className="grid gap-4 sm:grid-cols-2 border-l-2 border-primary/20 pl-4">
          <div className="space-y-2">
            <Label>¿Manejás stock? <HelpTip text="Si tenés productos almacenados para vender." /></Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={data.hasStock ? 'default' : 'outline'} onClick={() => update({ hasStock: true })}>Sí</Button>
              <Button type="button" size="sm" variant={!data.hasStock ? 'default' : 'outline'} onClick={() => update({ hasStock: false })}>No</Button>
            </div>
          </div>
          {data.hasStock && (
            <>
              <div className="space-y-2">
                <Label>¿Logística de envíos?</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={data.hasLogistics ? 'default' : 'outline'} onClick={() => update({ hasLogistics: true })}>Sí</Button>
                  <Button type="button" size="sm" variant={!data.hasLogistics ? 'default' : 'outline'} onClick={() => update({ hasLogistics: false })}>No</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Días de entrega del proveedor</Label>
                <Input type="number" value={data.supplierLeadDays} onChange={(e) => update({ supplierLeadDays: e.target.value })} placeholder="Ej: 15" />
              </div>
              <div className="space-y-2">
                <Label>Cantidad de SKUs</Label>
                <div className="flex flex-wrap gap-1.5">
                  {SKU_RANGES.map((r) => (
                    <Button key={r} type="button" size="sm" variant={data.skuCount === r ? 'default' : 'outline'}
                      className="h-8 text-xs" onClick={() => update({ skuCount: r })}>
                      {r}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>¿Clientes recurrentes?</Label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={data.hasRecurringClients ? 'default' : 'outline'} onClick={() => update({ hasRecurringClients: true })}>Sí</Button>
            <Button type="button" size="sm" variant={!data.hasRecurringClients ? 'default' : 'outline'} onClick={() => update({ hasRecurringClients: false })}>No</Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>¿Precios mayorista?</Label>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={data.hasWholesalePrices ? 'default' : 'outline'} onClick={() => update({ hasWholesalePrices: true })}>Sí</Button>
            <Button type="button" size="sm" variant={!data.hasWholesalePrices ? 'default' : 'outline'} onClick={() => update({ hasWholesalePrices: false })}>No</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Contabilidad</Label>
          <div className="flex flex-wrap gap-1.5">
            {ACCOUNTING_METHODS.map((m) => (
              <Button key={m} type="button" size="sm" variant={data.accountingMethod === m ? 'default' : 'outline'}
                className="h-8 text-xs" onClick={() => update({ accountingMethod: m })}>
                {m}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>CRM / ERP</Label>
          <Input value={data.crmErp} onChange={(e) => update({ crmErp: e.target.value })} placeholder="Ej: Contabilium, ninguno..." />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Publicidad online <HelpTip text="Si hacés campañas en Meta o Google, mostramos el rendimiento." /></Label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={data.usesMetaAds ? 'default' : 'outline'} onClick={() => update({ usesMetaAds: !data.usesMetaAds })}>Meta Ads</Button>
          <Button type="button" size="sm" variant={data.usesGoogleAds ? 'default' : 'outline'} onClick={() => update({ usesGoogleAds: !data.usesGoogleAds })}>Google Ads</Button>
        </div>
      </div>
    </div>,

    // Block 3: Objetivos
    <div key="goals" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-1">¿Qué querés lograr?</h2>
        <p className="text-sm text-muted-foreground">Esto prioriza lo que vas a ver primero en tu tablero.</p>
      </div>
      <div className="space-y-2.5">
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

    // Block 4: Result
    <div key="result" className="space-y-6">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="text-5xl mb-3"
        >
          {maturityInfo.emoji}
        </motion.div>
        <h2 className="text-2xl font-bold tracking-tight">{maturityInfo.title}</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">{maturityInfo.description}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-primary/[0.06] border border-primary/20 rounded-xl p-5 text-center"
      >
        <p className="text-sm text-muted-foreground mb-1">Potencial de mejora estimado</p>
        <p className="text-4xl font-black text-primary tabular-nums">{improvement}%</p>
        <p className="text-xs text-muted-foreground mt-1">en rentabilidad en los próximos 6 meses</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="space-y-3"
      >
        <p className="text-sm font-semibold">Tu tablero se va a configurar con foco en:</p>
        <div className="grid gap-2">
          {(() => {
            const painDim = PAIN_POINTS.find(p => p.id === data.painPoint);
            const priorities = painDim
              ? [painDim.dimension, ...PAIN_POINTS.filter(p => p.id !== data.painPoint).slice(0, 2).map(p => p.dimension)]
              : ['Ventas', 'Finanzas', 'Operaciones'];
            return priorities.map((dim, i) => (
              <div key={dim} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <span className="text-xs font-bold text-primary bg-primary/10 h-6 w-6 rounded-full flex items-center justify-center">{i + 1}</span>
                <span className="text-sm font-medium">{dim}</span>
                {i === 0 && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-auto font-semibold">Prioridad</span>}
              </div>
            ));
          })()}
        </div>
      </motion.div>

      <div className="bg-muted/30 rounded-lg p-4 text-xs text-muted-foreground">
        <Check className="h-4 w-4 inline mr-1 text-success" />
        {data.companyName ? `${data.companyName}: ` : ''}
        Dashboard configurado con {data.hasStock ? 'Stock, ' : ''}{data.usesMetaAds || data.usesGoogleAds ? 'Marketing, ' : ''}Ventas, Finanzas y más.
        Podés modificar todo desde Configuración.
      </div>
    </div>,
  ];

  return (
    <TooltipProvider>
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-xl">
          {/* Progress header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              {stepTitles.map((s, i) => (
                <button
                  key={i}
                  onClick={() => i <= step && setStep(i)}
                  className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                    i === step ? 'text-primary' : i < step ? 'text-foreground/60 cursor-pointer' : 'text-muted-foreground/40'
                  }`}
                >
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center transition-all ${
                    i === step ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' :
                    i < step ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground/40'
                  }`}>
                    {i < step ? <Check className="h-3.5 w-3.5" /> : s.icon}
                  </div>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              ))}
            </div>
            <Progress value={progress} className="h-1" />
          </div>

          {/* Content */}
          <Card className="shadow-xl border-border/50">
            <CardContent className="pt-6 pb-5 px-6">
              <StepWrapper stepKey={step}>
                {blocks[step]}
              </StepWrapper>
            </CardContent>
          </Card>

          {/* Navigation */}
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
              <Button onClick={handleFinish} disabled={saving} className="shadow-lg shadow-primary/20">
                {saving ? 'Guardando...' : 'Empezar a usar World of Data'} <Sparkles className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
