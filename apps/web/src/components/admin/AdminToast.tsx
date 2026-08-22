"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";

/**
 * Admin toast stack.
 *
 * Every mutation in the console — save, approve, delete, promote — needs to say
 * out loud that it happened, otherwise the only feedback is a row quietly
 * changing somewhere off-screen. Eight admin pages used to each carry their own
 * copy of a `<div className="fixed inset-x-0 bottom-16 …">`; this is that markup
 * once, mounted by AdminShell, reachable from anywhere via `useAdminToast()`.
 *
 * Errors stay up roughly twice as long as confirmations: a confirmation is
 * "yes, that worked, carry on", an error is something you have to read.
 */
type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  leaving?: boolean;
  undo?: { label: string; run: () => void };
}

interface ToastApi {
  success: (text: string, undo?: ToastItem["undo"]) => void;
  error: (text: string) => void;
  info: (text: string) => void;
}

const HOLD_MS: Record<ToastKind, number> = { success: 3200, info: 3200, error: 6000 };

const ToastCtx = createContext<ToastApi | null>(null);

/** Safe outside the provider so a stray call can never blank a page. */
const NOOP: ToastApi = { success: () => {}, error: () => {}, info: () => {} };

export function useAdminToast(): ToastApi {
  return useContext(ToastCtx) ?? NOOP;
}

export function AdminToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const drop = useCallback((id: number) => {
    // Mark first so the exit animation can run, then unmount.
    setItems((p) => p.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 170);
  }, []);

  const push = useCallback(
    (kind: ToastKind, text: string, undo?: ToastItem["undo"]) => {
      const id = ++seq.current;
      // Three is the most that can be read before the first one expires.
      setItems((p) => [...p.slice(-2), { id, kind, text, undo }]);
      setTimeout(() => drop(id), HOLD_MS[kind]);
    },
    [drop],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (text, undo) => push("success", text, undo),
      error: (text) => push("error", text),
      info: (text) => push("info", text),
    }),
    [push],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="admin-toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`admin-toast admin-toast--${t.kind} ${t.leaving ? "admin-toast--leaving" : ""}`}>
            <span className="admin-toast__icon">
              {t.kind === "success" ? (
                <CheckCircle2 size={15} />
              ) : t.kind === "error" ? (
                <XCircle size={15} />
              ) : (
                <Info size={15} />
              )}
            </span>
            <span className="admin-toast__body">{t.text}</span>
            {t.undo && (
              <button
                type="button"
                className="admin-toast__undo"
                onClick={() => {
                  t.undo?.run();
                  drop(t.id);
                }}
              >
                {t.undo.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
