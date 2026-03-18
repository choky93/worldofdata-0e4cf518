import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { APP_NAME } from '@/lib/constants';
import {
  BarChart3, ArrowRight, TrendingUp, Package, Users, Bell, Shield, Zap,
  Upload, LineChart, DollarSign, CheckCircle2, ChevronRight, Menu, X,
  Eye, Brain, Clock, Target,
} from 'lucide-react';

function AnimatedSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const features = [
  { icon: Eye, title: 'Visibilidad total', description: 'Todas tus métricas en un solo lugar. Ventas, gastos, stock, clientes — sin abrir 5 planillas.' },
  { icon: Brain, title: 'Alertas inteligentes', description: 'Te avisa antes de que pase: faltante de stock, clientes morosos, oportunidades de venta.' },
  { icon: TrendingUp, title: 'Pronósticos reales', description: 'Predicciones basadas en tu historial y estacionalidad. Sabé cuánto vas a facturar el mes que viene.' },
  { icon: DollarSign, title: 'Finanzas claras', description: 'Diferenciá lo que vendiste de lo que cobraste. Sabé exactamente cuánta plata tenés disponible.' },
  { icon: Package, title: 'Stock inteligente', description: 'Detecta sobrestock (plata parada) y faltantes antes de que pierdas ventas. Con semáforo visual.' },
  { icon: Users, title: 'Cartera de clientes', description: 'Identificá tus mejores clientes, quién te debe plata y si dependés demasiado de pocos compradores.' },
];

const benefits = [
  { icon: Clock, text: 'Ahorrá 10+ horas semanales que hoy gastás cruzando datos entre Excel, CRM y WhatsApp' },
  { icon: Target, text: 'Tomá decisiones basadas en datos, no en intuición o lo que "te parece"' },
  { icon: Shield, text: 'Anticipate a problemas de stock, caja y clientes antes de que exploten' },
  { icon: Zap, text: 'Tu equipo carga datos, vos ves resultados. Sin depender de un consultor externo' },
];

const steps = [
  { number: '01', title: 'Creá tu cuenta', description: 'Registrate en 30 segundos. Solo necesitás un email.' },
  { number: '02', title: 'Contanos de tu negocio', description: 'Un onboarding conversacional configura todo según tu rubro y necesidades.' },
  { number: '03', title: 'Cargá tus datos', description: 'Subí planillas, facturas o reportes. Tu equipo también puede cargar.' },
  { number: '04', title: 'Tomá mejores decisiones', description: 'Tu dashboard se arma automáticamente con métricas, alertas y pronósticos.' },
];

const testimonials = [
  { name: 'Roberto G.', role: 'Dueño — Ferretería Industrial', quote: 'Antes tardaba medio día cruzando datos. Ahora abro el dashboard y en 2 minutos sé cómo va todo.' },
  { name: 'Lucía M.', role: 'Gerenta — Distribuidora de alimentos', quote: 'Las alertas de stock me salvaron. Detectó que me iba a quedar sin un producto clave antes de la temporada alta.' },
  { name: 'Martín S.', role: 'Fundador — Estudio de diseño', quote: 'Por fin puedo ver la diferencia entre lo que facturé y lo que cobré. Cambia todo cuando lo ves claro.' },
];

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">{APP_NAME}</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Funcionalidades</a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cómo funciona</a>
            <a href="#benefits" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Beneficios</a>
            {isLoggedIn ? (
              <Link to="/dashboard"><Button size="sm">Ir al Dashboard <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
            ) : (
              <>
                <Link to="/login"><Button variant="ghost" size="sm">Ingresar</Button></Link>
                <Link to="/register"><Button size="sm">Empezar gratis <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
              </>
            )}
          </div>

          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X /> : <Menu />}
          </Button>
        </div>

        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="md:hidden border-t bg-background px-4 pb-4 space-y-3"
          >
            <a href="#features" className="block py-2 text-sm" onClick={() => setMobileMenuOpen(false)}>Funcionalidades</a>
            <a href="#how-it-works" className="block py-2 text-sm" onClick={() => setMobileMenuOpen(false)}>Cómo funciona</a>
            <a href="#benefits" className="block py-2 text-sm" onClick={() => setMobileMenuOpen(false)}>Beneficios</a>
            {isLoggedIn ? (
              <div className="flex gap-2 pt-2">
                <Link to="/dashboard" className="flex-1"><Button className="w-full">Ir al Dashboard <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
              </div>
            ) : (
              <div className="flex gap-2 pt-2">
                <Link to="/login" className="flex-1"><Button variant="outline" className="w-full">Ingresar</Button></Link>
                <Link to="/register" className="flex-1"><Button className="w-full">Empezar gratis</Button></Link>
              </div>
            )}
          </motion.div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-6">
                <Zap className="h-3.5 w-3.5" /> Para PyMEs que quieren crecer con datos
              </div>
              <h1 className="text-4xl md:text-6xl font-extrabold leading-[1.1] mb-6">
                El socio inteligente
                <br />
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  que tu empresa necesita
                </span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8 max-w-2xl mx-auto">
                Dejá de adivinar. {APP_NAME} centraliza tus ventas, gastos, stock y clientes en un dashboard
                inteligente que te dice <strong className="text-foreground">qué hacer</strong>, no solo qué pasó.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-3 justify-center"
            >
              <Link to="/register">
                <Button size="lg" className="text-base px-8 h-12 w-full sm:w-auto">
                  Empezar gratis <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
              <a href="#features">
                <Button size="lg" variant="outline" className="text-base px-8 h-12 w-full sm:w-auto">
                  Ver funcionalidades
                </Button>
              </a>
            </motion.div>
          </div>

          {/* Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-16 relative"
          >
            <div className="bg-card rounded-2xl shadow-2xl border p-4 md:p-6 max-w-5xl mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-3 w-3 rounded-full bg-destructive/40" />
                <div className="h-3 w-3 rounded-full bg-warning/40" />
                <div className="h-3 w-3 rounded-full bg-success/40" />
                <span className="text-xs text-muted-foreground ml-2">dashboard — Star Impresiones 3D</span>
              </div>
              <div className="grid grid-cols-3 gap-3 md:gap-4">
                <MockCard title="Ventas del mes" value="$1.240.000" sub="+12% vs año anterior" color="primary" />
                <MockCard title="Ganancia neta" value="$335.000" sub="Margen: 27%" color="success" />
                <MockCard title="Flujo de caja" value="$890.000" sub="Disponible hoy" color="warning" />
              </div>
              <div className="mt-3 md:mt-4 grid grid-cols-2 gap-3 md:gap-4">
                <div className="bg-muted/50 rounded-xl p-3 md:p-4">
                  <p className="text-[10px] md:text-xs text-muted-foreground mb-2">Ventas diarias — Marzo</p>
                  <div className="flex items-end gap-[3px] md:gap-1 h-16 md:h-20">
                    {[40, 65, 55, 78, 45, 82, 60, 72, 58, 90, 68, 75, 85, 62, 95, 70, 88, 76].map((h, i) => (
                      <div key={i} className="flex-1 bg-primary/30 rounded-t" style={{ height: `${h}%` }}>
                        <div className="w-full bg-primary rounded-t" style={{ height: `${60 + Math.random() * 40}%` }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 md:p-4 space-y-1.5 md:space-y-2">
                  <p className="text-[10px] md:text-xs text-muted-foreground">Alertas activas</p>
                  <div className="bg-destructive/10 text-[10px] md:text-xs p-1.5 md:p-2 rounded border-l-2 border-l-destructive truncate">
                    ⚡ Comprá Ender 3 V3 — solo quedan 4 uds
                  </div>
                  <div className="bg-warning/10 text-[10px] md:text-xs p-1.5 md:p-2 rounded border-l-2 border-l-warning truncate">
                    💰 3 clientes te deben $380.000
                  </div>
                  <div className="bg-primary/10 text-[10px] md:text-xs p-1.5 md:p-2 rounded border-l-2 border-l-primary truncate">
                    📈 Abril es tu 2do mejor mes — prepará stock
                  </div>
                </div>
              </div>
            </div>
            {/* Glow effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 rounded-3xl -z-10 blur-2xl" />
          </motion.div>
        </div>
      </section>

      {/* Social Proof Bar */}
      <section className="py-8 border-y bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 text-center">
            <div>
              <p className="text-2xl md:text-3xl font-bold">+150</p>
              <p className="text-xs text-muted-foreground">Empresas activas</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold">$2.8B</p>
              <p className="text-xs text-muted-foreground">En ventas procesadas</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold">10hs</p>
              <p className="text-xs text-muted-foreground">Ahorradas por semana</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-bold">98%</p>
              <p className="text-xs text-muted-foreground">Satisfacción</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Todo lo que necesitás, en un solo lugar</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              No es un dashboard más. Es un sistema que analiza, predice, alerta y recomienda acciones concretas.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => (
              <AnimatedSection key={i} delay={i * 0.08}>
                <Card className="h-full hover:shadow-lg transition-all duration-300 border-0 bg-card hover:-translate-y-1 group">
                  <CardContent className="pt-6">
                    <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <feature.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Empezá en 5 minutos</h2>
            <p className="text-lg text-muted-foreground">Sin configuración técnica. Sin consultor. Sin manuales.</p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <AnimatedSection key={i} delay={i * 0.1}>
                <div className="relative">
                  <span className="text-6xl font-black text-primary/10 absolute -top-4 -left-1">{step.number}</span>
                  <div className="pt-10">
                    <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                  {i < steps.length - 1 && (
                    <ChevronRight className="hidden lg:block absolute top-12 -right-3 h-5 w-5 text-muted-foreground/30" />
                  )}
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="benefits" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <AnimatedSection>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Pensado para el dueño que está metido en todo
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Sabemos que no tenés tiempo para aprender sistemas complicados.
                Por eso todo es intuitivo, visual y va directo al punto.
              </p>
              <div className="space-y-4">
                {benefits.map((b, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex gap-3 items-start"
                  >
                    <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0 mt-0.5">
                      <b.icon className="h-4 w-4 text-success" />
                    </div>
                    <p className="text-sm leading-relaxed">{b.text}</p>
                  </motion.div>
                ))}
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.2}>
              <Card className="border-0 shadow-xl bg-card overflow-hidden">
                <CardContent className="p-0">
                  <div className="bg-primary/5 p-6 border-b">
                    <p className="text-sm text-muted-foreground">Resumen ejecutivo</p>
                    <p className="text-xl font-semibold mt-1">Buen día, Roberto. Acá va tu resumen.</p>
                  </div>
                  <div className="p-6 space-y-3">
                    <div className="flex items-start gap-2 text-sm bg-success/5 p-3 rounded-lg">
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      <span>Llevás vendido $1.240.000 en marzo. Estás un 12% arriba del mismo período del año pasado.</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm bg-warning/5 p-3 rounded-lg">
                      <Bell className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                      <span>Tenés $380.000 pendientes de cobro de 3 clientes. Contactalos.</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm bg-destructive/5 p-3 rounded-lg">
                      <Package className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <span>Tu stock de Ender 3 V3 alcanza para 10 días. Tu proveedor tarda 15.</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Lo que dicen nuestros clientes</h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <AnimatedSection key={i} delay={i * 0.1}>
                <Card className="h-full border-0 hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex gap-1 mb-4">
                      {[...Array(5)].map((_, j) => (
                        <div key={j} className="h-4 w-4 rounded-sm bg-warning" />
                      ))}
                    </div>
                    <p className="text-sm leading-relaxed mb-4 italic">"{t.quote}"</p>
                    <div className="border-t pt-3">
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Adaptable section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Se adapta a tu negocio</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              No importa si vendés productos, servicios o ambos. El sistema se configura automáticamente
              según tu rubro y necesidades.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['Retail', 'Gastronomía', 'Manufactura', 'Servicios', 'Tecnología', 'Salud', 'Construcción', 'Y más...'].map((rubro, i) => (
              <AnimatedSection key={i} delay={i * 0.05}>
                <div className="bg-card border rounded-xl p-4 text-center hover:border-primary/30 hover:shadow-md transition-all">
                  <p className="font-medium text-sm">{rubro}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedSection>
            <h2 className="text-3xl md:text-5xl font-bold mb-6">
              Empezá a tomar mejores decisiones
              <br />
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">hoy mismo</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Registrate gratis, configurá tu negocio en 5 minutos y descubrí lo que tus datos
              tienen para decirte.
            </p>
            <Link to="/register">
              <Button size="lg" className="text-base px-10 h-13">
                Crear cuenta gratis <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-4">Sin tarjeta de crédito · Configuración en 5 minutos</p>
          </AnimatedSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10 px-4 bg-muted/20">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">{APP_NAME}</span>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} {APP_NAME}. Todos los derechos reservados.</p>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Privacidad</a>
            <a href="#" className="hover:text-foreground transition-colors">Términos</a>
            <a href="#" className="hover:text-foreground transition-colors">Contacto</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MockCard({ title, value, sub, color }: { title: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-muted/50 rounded-xl p-3 md:p-4">
      <p className="text-[10px] md:text-xs text-muted-foreground">{title}</p>
      <p className="text-base md:text-xl font-bold tabular-nums mt-1">{value}</p>
      <p className={`text-[10px] md:text-xs mt-0.5 ${color === 'success' ? 'text-success' : color === 'warning' ? 'text-warning' : 'text-primary'}`}>{sub}</p>
    </div>
  );
}
