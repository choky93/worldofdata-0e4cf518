import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/constants';

const placeholderSuggestions = [
  '¿Por qué bajaron las ventas este mes?',
  '¿Qué producto debería empujar?',
  '¿Qué cliente estoy perdiendo?',
  '¿Cuánto voy a tener en caja a fin de mes?',
  '¿Mi ROAS mejoró?',
];

export function AICopilot() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 transition-shadow"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: 'spring', stiffness: 260, damping: 20 }}
      >
        <MessageSquareSpark className="h-6 w-6" />
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
              onClick={() => setOpen(false)}
            />

            {/* Chat panel */}
            <motion.div
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-background border-l border-border/50 z-50 flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold tracking-tight">Preguntale a {APP_NAME}</p>
                    <p className="text-[11px] text-muted-foreground">Tu copiloto de negocios</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-auto p-5 flex flex-col items-center justify-center">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-center max-w-sm"
                >
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold tracking-tight mb-2">Próximamente</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Vas a poder preguntarme cualquier cosa sobre tu negocio y te respondo con datos reales, análisis y recomendaciones.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mt-8 w-full space-y-2"
                >
                  <p className="text-xs text-muted-foreground font-medium mb-3">Por ejemplo, vas a poder preguntar:</p>
                  {placeholderSuggestions.map((s, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.08 }}
                      className="bg-muted/40 border border-border/40 rounded-lg px-4 py-2.5 text-sm text-muted-foreground cursor-default"
                    >
                      {s}
                    </motion.div>
                  ))}
                </motion.div>
              </div>

              {/* Input (disabled) */}
              <div className="p-4 border-t border-border/30">
                <div className="flex items-center gap-2 bg-muted/30 rounded-xl px-4 py-3 border border-border/40">
                  <input
                    disabled
                    placeholder="Preguntale algo a tu negocio..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed"
                  />
                  <Button disabled size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-2 text-center">Disponible en la próxima actualización</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
