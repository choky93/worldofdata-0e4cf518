import { motion } from 'framer-motion';
import { Sparkles, Circle } from 'lucide-react';

interface ResumenEjecutivoCardProps {
  highlights: string[];
}

export function ResumenEjecutivoCard({ highlights }: ResumenEjecutivoCardProps) {
  const items = highlights.length > 0 ? highlights : ['Cargá tus archivos para ver tu resumen ejecutivo.'];

  const now = new Date().toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div
      className="relative overflow-hidden rounded-3xl p-7 text-white h-full min-h-[260px] flex flex-col shadow-card"
      style={{
        background: 'linear-gradient(135deg, hsl(var(--accent)) 0%, hsl(240 10% 18%) 100%)',
      }}
    >
      {/* Pastel glows decorativos */}
      <div
        aria-hidden
        className="absolute -top-12 -right-12 w-56 h-56 rounded-full opacity-50 blur-3xl"
        style={{ background: 'hsl(var(--pastel-yellow))' }}
      />
      <div
        aria-hidden
        className="absolute bottom-0 -left-10 w-40 h-40 rounded-full opacity-30 blur-3xl"
        style={{ background: 'hsl(var(--pastel-mint))' }}
      />
      <div
        aria-hidden
        className="absolute top-20 right-8 w-24 h-24 rounded-2xl rotate-12 opacity-40"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--pastel-lavender)) 0%, hsl(var(--pastel-sky)) 100%)',
          filter: 'blur(2px)',
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs uppercase tracking-widest opacity-70">
          Resumen ejecutivo
        </span>
      </div>

      {/* Mensajes */}
      <div className="relative z-10 flex-1 space-y-3">
        {items.slice(0, 4).map((h, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-start gap-3"
          >
            <div className="mt-1.5 flex-shrink-0">
              <Circle
                className="w-2 h-2"
                fill="hsl(var(--pastel-yellow))"
                strokeWidth={0}
              />
            </div>
            <p className="text-sm text-white/90 leading-relaxed">{h}</p>
          </motion.div>
        ))}
      </div>

      {/* Footer */}
      <div className="relative z-10 pt-4 mt-4 border-t border-white/10 flex items-center justify-between">
        <span className="text-[10px] text-white/40 uppercase tracking-wider">Actualizado</span>
        <span className="text-[10px] text-white/60">{now}</span>
      </div>
    </div>
  );
}
