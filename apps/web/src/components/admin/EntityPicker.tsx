"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";

/**
 * Searchable, creatable pickers for the name-based taxonomy.
 *
 * Level, lecturer, publisher and category all resolve *by name* on the server:
 * a matching row is reused, an unknown name creates one. A bare text input made
 * those two outcomes indistinguishable — you could not see what already
 * existed, so "Artificial Intelligence" typed a second time as "artificial
 * intelligence" silently forked the catalogue in two.
 *
 * `<datalist>` was the previous attempt and is the wrong tool: it only offers
 * suggestions while you type, never the full list on demand, and it cannot warn
 * that a value is new. Here the list is always one click away, selection is
 * exact, and anything that would create a row says so before you save.
 */
export interface PickerOption {
  name: string;
  /** Emoji shown before the name — categories carry one. */
  icon?: string | null;
  /** Thumbnail shown before the name — lecturer photo, publisher logo. */
  image?: string | null;
  /** Right-aligned detail, e.g. "4 courses". */
  meta?: string;
}

/** Trim- and case-insensitive, so "  AI " and "ai" count as the same name. */
const norm = (s: string) => s.trim().toLowerCase();

/** Close on an outside pointerdown; the popup is not modal, so that is all. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);
  return ref;
}

function OptionBody({ opt }: { opt: PickerOption }) {
  return (
    <>
      {opt.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={opt.image} alt="" className="admin-combo__pic" />
      ) : opt.icon ? (
        <span className="admin-combo__emoji" aria-hidden="true">
          {opt.icon}
        </span>
      ) : null}
      <span className="admin-combo__name">{opt.name}</span>
      {opt.meta && <small>{opt.meta}</small>}
    </>
  );
}

/** One name: pick an existing row from the list, or type a new one. */
export function EntityPicker({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
  createNote = "will be created when you save",
  emptyNote = "Nothing here yet — type a name to add one.",
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (name: string) => void;
  options: PickerOption[];
  placeholder?: string;
  hint?: ReactNode;
  createNote?: string;
  emptyNote?: string;
  wide?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useDismiss(open, () => setOpen(false));

  // Filter only against text the operator typed *this* time round. Opening the
  // list on a field that already reads "Intermediate" should show all four
  // levels, not just the one already chosen.
  const shown = useMemo(() => {
    const q = typed ? norm(value) : "";
    return q ? options.filter((o) => norm(o.name).includes(q)) : options;
  }, [options, value, typed]);

  const exact = options.some((o) => norm(o.name) === norm(value));
  const isNew = Boolean(value.trim()) && !exact;
  const rows = shown.length + (isNew ? 1 : 0);

  const openList = () => {
    setTyped(false);
    setHi(0);
    setOpen(true);
  };

  const pick = (name: string) => {
    onChange(name);
    setTyped(false);
    setOpen(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      if (rows > 0) setHi((i) => (i + (e.key === "ArrowDown" ? 1 : rows - 1)) % rows);
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (hi < shown.length) pick(shown[hi].name);
      else setOpen(false); // the create row means "keep what I typed"
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={wide ? "admin-field admin-field--wide" : "admin-field"}>
      <span className="admin-label">{label}</span>
      <div className="admin-combo" ref={ref}>
        <input
          className="admin-input admin-input--full"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && hi < shown.length ? `${listId}-${hi}` : undefined}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setTyped(true);
            setHi(0);
            setOpen(true);
          }}
          onFocus={openList}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="admin-combo__toggle"
          aria-label={`Show the ${label.toLowerCase()} list`}
          tabIndex={-1}
          onClick={() => (open ? setOpen(false) : openList())}
        >
          <ChevronDown size={13} />
        </button>
        {open && (
          <ul className="admin-combo__list" id={listId} role="listbox" aria-label={label}>
            {shown.map((o, i) => (
              <li
                key={o.name}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={norm(o.name) === norm(value)}
                data-active={i === hi}
                className="admin-combo__opt"
                onPointerEnter={() => setHi(i)}
                onClick={() => pick(o.name)}
              >
                <OptionBody opt={o} />
                {norm(o.name) === norm(value) && <Check size={12} className="admin-combo__tick" />}
              </li>
            ))}
            {shown.length === 0 && !isNew && <li className="admin-combo__none">{emptyNote}</li>}
            {isNew && (
              <li
                role="option"
                aria-selected={false}
                data-active={hi === shown.length}
                className="admin-combo__opt admin-combo__opt--new"
                onPointerEnter={() => setHi(shown.length)}
                onClick={() => setOpen(false)}
              >
                <Plus size={12} />
                <span className="admin-combo__name">Create “{value.trim()}”</span>
              </li>
            )}
          </ul>
        )}
      </div>
      {isNew ? (
        <span className="admin-field__hint admin-field__hint--new">
          New — “{value.trim()}” {createNote}.
        </span>
      ) : hint ? (
        <span className="admin-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

/** Many names: chips for what is chosen, the full list to toggle against. */
export function MultiEntityPicker({
  label,
  values,
  onChange,
  options,
  placeholder,
  hint,
  emptyNote = "Nothing here yet — type a name to add one.",
  wide = false,
}: {
  label: string;
  values: string[];
  onChange: (names: string[]) => void;
  options: PickerOption[];
  placeholder?: string;
  hint?: ReactNode;
  emptyNote?: string;
  wide?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useDismiss(open, () => setOpen(false));

  const chosen = useMemo(() => new Set(values.map(norm)), [values]);
  const shown = useMemo(() => {
    const n = norm(q);
    return n ? options.filter((o) => norm(o.name).includes(n)) : options;
  }, [options, q]);

  const known = useMemo(() => new Set([...options.map((o) => norm(o.name)), ...chosen]), [options, chosen]);
  const isNew = Boolean(q.trim()) && !known.has(norm(q));
  const rows = shown.length + (isNew ? 1 : 0);

  const iconOf = (name: string) => options.find((o) => norm(o.name) === norm(name));

  const toggle = (name: string) => {
    onChange(chosen.has(norm(name)) ? values.filter((v) => norm(v) !== norm(name)) : [...values, name]);
    setQ("");
    setHi(0);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (rows > 0) setHi((i) => (i + (e.key === "ArrowDown" ? 1 : rows - 1)) % rows);
    } else if (e.key === "Enter" && rows > 0) {
      e.preventDefault();
      toggle(hi < shown.length ? shown[hi].name : q.trim());
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Backspace" && !q && values.length) {
      // Emptying a chip-input with Backspace is the expected gesture.
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className={wide ? "admin-field admin-field--wide" : "admin-field"}>
      <span className="admin-label">{label}</span>
      <div className="admin-combo" ref={ref}>
        <div className="admin-combo__box" onClick={() => inputRef.current?.focus()}>
          {values.map((v) => (
            <span
              key={v}
              className="admin-chip"
              /* A chip with no matching row is about to create one — worth seeing
                 before saving, since that is how duplicate categories happen. */
              data-new={iconOf(v) ? undefined : "true"}
              title={iconOf(v) ? v : `${v} — new, created when you save`}
            >
              {iconOf(v)?.icon && <span aria-hidden="true">{iconOf(v)?.icon}</span>}
              <span>{v}</span>
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(values.filter((x) => x !== v));
                }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            className="admin-combo__bare"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && hi < shown.length ? `${listId}-${hi}` : undefined}
            aria-label={label}
            value={q}
            placeholder={values.length ? "" : placeholder}
            onChange={(e) => {
              setQ(e.target.value);
              setHi(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
        </div>
        <button
          type="button"
          className="admin-combo__toggle"
          aria-label={`Show the ${label.toLowerCase()} list`}
          tabIndex={-1}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown size={13} />
        </button>
        {open && (
          <ul className="admin-combo__list" id={listId} role="listbox" aria-label={label} aria-multiselectable="true">
            {shown.map((o, i) => (
              <li
                key={o.name}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={chosen.has(norm(o.name))}
                data-active={i === hi}
                className="admin-combo__opt"
                onPointerEnter={() => setHi(i)}
                onClick={() => toggle(o.name)}
              >
                <OptionBody opt={o} />
                {chosen.has(norm(o.name)) && <Check size={12} className="admin-combo__tick" />}
              </li>
            ))}
            {shown.length === 0 && !isNew && <li className="admin-combo__none">{emptyNote}</li>}
            {isNew && (
              <li
                role="option"
                aria-selected={false}
                data-active={hi === shown.length}
                className="admin-combo__opt admin-combo__opt--new"
                onPointerEnter={() => setHi(shown.length)}
                onClick={() => toggle(q.trim())}
              >
                <Plus size={12} />
                <span className="admin-combo__name">Create “{q.trim()}”</span>
              </li>
            )}
          </ul>
        )}
      </div>
      {hint ? <span className="admin-field__hint">{hint}</span> : null}
    </div>
  );
}


