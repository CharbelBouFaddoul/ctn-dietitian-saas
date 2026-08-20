"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export interface ToastItem {
  id: number;
  message: string;
  tone?: "neutral" | "success" | "danger";
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastItem["tone"]) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => undefined,
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, tone: ToastItem["tone"] = "neutral") => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ui-toast-region" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={item.tone === "neutral" ? "ui-toast" : `ui-toast ui-toast--${item.tone}`}>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function Toast({ message, tone = "neutral" }: { message: string; tone?: ToastItem["tone"] }) {
  return <div className={tone === "neutral" ? "ui-toast" : `ui-toast ui-toast--${tone}`}>{message}</div>;
}
