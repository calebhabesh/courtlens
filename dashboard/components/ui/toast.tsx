"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { motion, AnimatePresence, toastVariants } from "../../lib/motion";
import { Icon } from "./icon";

export type ToastVariant = "default" | "positive" | "negative" | "info";

export interface ToastMessage {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  toast: (message: Omit<ToastMessage, "id">) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "default", durationMs = 5000 }: Omit<ToastMessage, "id">) => {
      const id = Math.random().toString(36).slice(2, 9);
      const newToast: ToastMessage = { id, title, description, variant, durationMs };
      setToasts(prev => [...prev, newToast]);

      if (durationMs > 0) {
        setTimeout(() => {
          dismiss(id);
        }, durationMs);
      }
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="ui-toast-container" role="region" aria-label="Notifications">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              role="alert"
              variants={toastVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`ui-toast ui-toast-${t.variant}`}
            >
              <div className="ui-toast-icon">
                {t.variant === "positive" ? (
                  <Icon name="check" size={16} />
                ) : t.variant === "negative" ? (
                  <Icon name="alert" size={16} />
                ) : (
                  <Icon name="info" size={16} />
                )}
              </div>
              <div className="ui-toast-content">
                <div className="ui-toast-title">{t.title}</div>
                {t.description && <div className="ui-toast-desc text-muted">{t.description}</div>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="ui-toast-close"
                aria-label="Dismiss notification"
              >
                <Icon name="close" size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
