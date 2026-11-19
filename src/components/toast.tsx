"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// Errors appear as a red toast at the top of the screen; input is kept (spec ch.4).
type Tone = "error" | "info";
interface Toast {
  id: number;
  tone: Tone;
  message: string;
}
interface ToastApi {
  error: (message: string) => void;
  info: (message: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Tone, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 8000 : 4000);
  }, []);
  const api = useMemo<ToastApi>(() => ({ error: (m) => push("error", m), info: (m) => push("info", m) }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed top-[72px] left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[min(640px,calc(100%-32px))]" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`px-4 py-3 text-sm flex items-start justify-between gap-4 ${t.tone === "error" ? "bg-red text-white" : "bg-ink text-white"}`}>
            <span>{t.message}</span>
            <button type="button" aria-label="閉じる" className="shrink-0" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
