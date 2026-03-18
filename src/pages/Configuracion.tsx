import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Settings, ArrowRight } from 'lucide-react';

export default function Configuracion() {
  const { companyName, companySettings } = useAuth();
  const completion = companySettings?.onboarding_completion_pct ?? 0;

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
        <CardContent className="space-y-2 text-sm">
          <Row label="Stock" active={companySettings?.has_stock ?? true} />
          <Row label="Marketing" active={(companySettings?.uses_meta_ads || companySettings?.uses_google_ads) ?? true} />
          <Row label="Logística" active={companySettings?.has_logistics ?? false} />
          <p className="text-xs text-muted-foreground pt-2">Estas secciones se configuran según tus respuestas del onboarding.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex justify-between py-1">
      <span>{label}</span>
      <span className={active ? 'text-success font-medium' : 'text-muted-foreground'}>
        {active ? 'Visible' : 'Oculta'}
      </span>
    </div>
  );
}
