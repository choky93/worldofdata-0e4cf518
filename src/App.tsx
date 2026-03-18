import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
import ForgotPassword from "./pages/ForgotPassword";
import Onboarding from "./pages/Onboarding";
import Ventas from "./pages/Ventas";
import Finanzas from "./pages/Finanzas";
import Stock from "./pages/Stock";
import Clientes from "./pages/Clientes";
import Forecast from "./pages/Forecast";
import Alertas from "./pages/Alertas";
import Metricas from "./pages/Metricas";
import Marketing from "./pages/Marketing";
import Operaciones from "./pages/Operaciones";
import CargaDatos from "./pages/CargaDatos";
import Equipo from "./pages/Equipo";
import Configuracion from "./pages/Configuracion";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, companySettings } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p>Cargando...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (companySettings && !companySettings.onboarding_completed) return <Navigate to="/onboarding" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function OnboardingRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p>Cargando...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Onboarding />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, companySettings } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p>Cargando...</p></div>;
  if (user && companySettings?.onboarding_completed) return <Navigate to="/dashboard" replace />;
  if (user && companySettings && !companySettings.onboarding_completed) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="/onboarding" element={<OnboardingRoute />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/ventas" element={<ProtectedRoute><Ventas /></ProtectedRoute>} />
            <Route path="/finanzas" element={<ProtectedRoute><Finanzas /></ProtectedRoute>} />
            <Route path="/stock" element={<ProtectedRoute><Stock /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
            <Route path="/forecast" element={<ProtectedRoute><Forecast /></ProtectedRoute>} />
            <Route path="/alertas" element={<ProtectedRoute><Alertas /></ProtectedRoute>} />
            <Route path="/metricas" element={<ProtectedRoute><Metricas /></ProtectedRoute>} />
            <Route path="/marketing" element={<ProtectedRoute><Marketing /></ProtectedRoute>} />
            <Route path="/operaciones" element={<ProtectedRoute><Operaciones /></ProtectedRoute>} />
            <Route path="/carga-datos" element={<ProtectedRoute><CargaDatos /></ProtectedRoute>} />
            <Route path="/equipo" element={<ProtectedRoute><Equipo /></ProtectedRoute>} />
            <Route path="/configuracion" element={<ProtectedRoute><Configuracion /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
