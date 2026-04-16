import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface ResumenEjecutivoCardProps {
  highlights: string[];
}

export function ResumenEjecutivoCard({ highlights }: ResumenEjecutivoCardProps) {
  const items = highlights.length > 0 ? highlights : ['Cargá tus archivos para ver tu resumen ejecutivo.'];

  return (
    <div
      className="relative overflow-hidden rounded-3xl p-7 text-white h-full min-h-[260px]"
      style={{
        background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)',
      }}
    >
      {/* Pastel glows */}
      <div
        aria-hidden
        className="absolute -top-20 -right-16 w-72 h-72 rounded-full opacity-30 blur-3xl"
        style={{ background: 'hsl(var(--pastel-mint))' }}
      />
      <div
        aria-hidden
        className="absolute -bottom-24 -left-10 w-64 h-64 rounded-full opacity-25 blur-3xl"
        style={{ background: 'hsl(var(--pastel-lavender))' }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="text-xs uppercase tracking-widest opacity-70">
            Resumen ejecutivo
          </span>
        </div>

        <ul className="space-y-3">
          {items.slice(0, 4).map((h, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="text-base leading-snug flex gap-2"
            >
              <span className="text-accent shrink-0">▸</span>
              <span className="opacity-90">{h}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}
