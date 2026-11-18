"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

/**
 * The pill dropdown phono.cc uses for "Movie Genre / Documentary" and for every
 * settings selector: a bordered pill that opens a rounded panel under itself.
 *
 * Native `<select>` was doing this job and it is the one control a browser will
 * not let you style — an OS-blue list on a near-black page. This keeps the
 * keyboard contract (`aria-haspopup`, `aria-expanded`, Escape to close) while
 * looking like the rest of the site.
 */
export function Menu({
  value,
  options,
  onChange,
  label,
  align = "left",
  className = "",
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  label?: string;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`menu ${className}`} ref={ref}>
      <button
        type="button"
        className={`menu-btn ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span>{current?.label ?? label ?? "Select"}</span>
        <ChevronDown className="chev" size={14} strokeWidth={2.2} />
      </button>
      {open && (
        <div className={`menu-panel ${align === "right" ? "menu-panel--right" : ""}`} role="listbox">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`menu-item ${o.value === value ? "on" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              {o.value === value && <Check className="tick" size={14} strokeWidth={2.4} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
