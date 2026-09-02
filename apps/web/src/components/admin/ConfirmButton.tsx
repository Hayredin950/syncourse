"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

/**
 * Two-step destructive action, in place of `window.confirm()`.
 *
 * `confirm()` was doing the safety work on six admin pages, which is a problem
 * twice over: it is a browser-chrome dialog that looks nothing like the product,
 * and it steals focus so hard that a stray Enter keypress confirms a delete.
 * Here the question appears exactly where the click happened, Escape backs out,
 * and the armed state disarms itself after a few seconds of hesitation.
 */
export default function ConfirmButton({
  onConfirm,
  label = "Delete",
  question = "Confirm delete?",
  confirmLabel = "Yes, delete",
  busy = false,
  icon = true,
  className = "admin-btn admin-btn--danger",
  disabled = false,
  ariaLabel,
}: {
  onConfirm: () => void | Promise<void>;
  label?: string;
  question?: string;
  confirmLabel?: string;
  busy?: boolean;
  icon?: boolean;
  className?: string;
  disabled?: boolean;
  /** Required when `label` is empty — an icon-only button needs a name. */
  ariaLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed) return;
    // Walking away from an armed delete should leave it disarmed.
    timer.current = setTimeout(() => setArmed(false), 5000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("keydown", onKey);
    };
  }, [armed]);

  if (!armed) {
    return (
      <button
        type="button"
        className={className}
        aria-label={ariaLabel}
        title={ariaLabel}
        disabled={disabled || busy}
        onClick={() => setArmed(true)}
      >
        {icon && <Trash2 size={13} />}
        {label}
      </button>
    );
  }

  return (
    <span className="admin-confirm">
      <span className="admin-confirm__ask">{question}</span>
      <button
        type="button"
        className="admin-btn admin-btn--danger-solid admin-btn--sm"
        disabled={busy}
        autoFocus
        onClick={async () => {
          setArmed(false);
          await onConfirm();
        }}
      >
        {busy ? "…" : confirmLabel}
      </button>
      <button type="button" className="admin-btn admin-btn--quiet admin-btn--sm" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  );
}
