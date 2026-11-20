"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
  /** Right-aligned detail, e.g. "12 courses". */
  meta?: string;
}

/**
 * The pill dropdown from `Menu`, with a filter box inside the panel.
 *
 * The catalogue grows every day, so a fixed list of a dozen names cannot be the
 * whole story: the instructor rail only had the first twelve lecturers
 * alphabetically, and the one you wanted was simply not there. This control
 * takes the full list from the API and lets you type two letters to find a
 * name, then pick it with the mouse or the keyboard — a select that is also a
 * search field, without turning into a text input that stumbles on a typo.
 */
export function SearchableMenu({
  value,
  options,
  onChange,
  label,
  placeholder = "Type to filter…",
  align = "left",
  className = "",
}: {
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = options.find((o) => o.value === value);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // The active row must follow the filtered list, not a stale index.
  useEffect(() => setHi(0), [query]);

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

  // Opening starts with an empty filter and the caret already in it, so the
  // list is both browsable and searchable with the same gesture.
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    inputRef.current?.focus();
  }, [open]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (shown.length === 0) return;
      setHi((i) => (i + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[hi]) pick(shown[hi].value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={`menu menu--searchable ${className}`} ref={ref}>
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
          <div className="menu-search">
            <Search size={13} strokeWidth={2.1} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              aria-label={label ? `Filter ${label.toLowerCase()}s` : "Filter options"}
              aria-autocomplete="list"
              autoComplete="off"
            />
          </div>
          <div className="menu-options">
            {shown.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`menu-item ${o.value === value ? "on" : ""} ${i === hi ? "hi" : ""}`}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(o.value)}
              >
                <span>{o.label}</span>
                {o.meta && <small className="menu-item__meta">{o.meta}</small>}
                {o.value === value && <Check className="tick" size={14} strokeWidth={2.4} />}
              </button>
            ))}
            {shown.length === 0 && <p className="menu-empty">Nothing matches “{query.trim()}”.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
