"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

type Toast = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastInput = Omit<Toast, "id">;

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

const VARIANT_STYLE: Record<ToastVariant, { container: string; icon: ReactNode }> = {
  success: {
    container: "border-ds-success/40 bg-ds-success-bg text-ds-success",
    icon: <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />,
  },
  error: {
    container: "border-ds-danger/40 bg-ds-danger-bg text-ds-danger",
    icon: <AlertCircle className="size-4 shrink-0" aria-hidden="true" />,
  },
  info: {
    container: "border-ds-border bg-ds-surface-elevated text-ds-text-primary",
    icon: <Info className="size-4 shrink-0 text-ds-text-secondary" aria-hidden="true" />,
  },
};

/**
 * Hand-built (not a library) -- matches this codebase's existing convention
 * of hand-building interactive primitives (WAI-ARIA tabs, focus trap) with
 * `motion` (already a dependency) rather than adding a new one. Mounted
 * once in app/(dashboard)/dashboard/layout.tsx so `useToast()` works from
 * any dashboard page/client component.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const shouldReduceMotion = useReducedMotion();

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      idRef.current += 1;
      const id = `toast-${idRef.current}`;
      setToasts((current) => [...current, { ...input, id }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4"
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => (
            <motion.div
              key={item.id}
              role="status"
              layout={!shouldReduceMotion}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-ds-lg border px-3 py-2.5 shadow-lg ${VARIANT_STYLE[item.variant].container}`}
            >
              {VARIANT_STYLE[item.variant].icon}
              <div className="flex-1 text-sm">
                <p className="font-medium">{item.title}</p>
                {item.description ? <p className="text-xs opacity-90">{item.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded-ds-sm p-0.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast() must be used within a ToastProvider.");
  }
  return context;
}
