"use client";
// In-app confirmation dialog. Native window.confirm is suppressed in some embedded browsers
// (it returns false without showing anything), so every confirmation goes through this.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "./ui";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const Ctx = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => new Promise<boolean>((resolve) => {
    setPending((prev) => {
      prev?.resolve(false);
      return { ...opts, resolve };
    });
  }), []);

  const close = useCallback((ok: boolean) => {
    setPending((prev) => {
      prev?.resolve(ok);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, close]);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {pending ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 px-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md bg-white border border-ink p-5 flex flex-col gap-4 shadow-lg">
            <p id="confirm-title" className="text-base font-bold">{pending.title}</p>
            {pending.message ? <div className="text-sm text-ink-2 whitespace-pre-wrap">{pending.message}</div> : null}
            <div className="flex justify-end gap-2.5">
              <Button onClick={() => close(false)}>{pending.cancelLabel ?? "キャンセル"}</Button>
              <Button autoFocus variant="primary" className={pending.danger ? "" : "!bg-ink !border-ink"} onClick={() => close(true)}>
                {pending.confirmLabel ?? "OK"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

/** `await confirm({ title, message, danger })` resolves true only when the user presses the confirm button. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
