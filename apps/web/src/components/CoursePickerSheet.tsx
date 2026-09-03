"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { get } from "@/lib/api";
import type { CourseSummary } from "@/lib/types";

/**
 * Pick courses out of the existing catalogue. A list you can only name is an
 * empty shelf, so this is the piece that makes one mean anything: search the
 * catalogue, tick a few, add them in one request.
 *
 * `already` are the ids the list holds; they stay visible but locked so it is
 * obvious the course is in there rather than missing from the search.
 *
 * `single` swaps ticking for picking: a circle post carries one recommendation,
 * so tapping a row there returns it immediately instead of building a set.
 */
export function CoursePickerSheet({
  already,
  onClose,
  onAdd,
  busy,
  single,
  heading = "Add courses",
  cta,
}: {
  already: string[];
  onClose: () => void;
  /** The rows as well as the ids: a caller showing what it picked would otherwise
      have to re-fetch the course just to print its title. */
  onAdd: (courseIds: string[], courses: CourseSummary[]) => void;
  busy?: boolean;
  single?: boolean;
  heading?: string;
  cta?: string;
}) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [results, setResults] = useState<CourseSummary[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const have = useMemo(() => new Set(already), [already]);

  // 300ms is long enough that typing a title doesn't fire a request per keystroke.
  useEffect(() => {
    if (!q.trim()) {
      setDq("");
      return;
    }
    const t = setTimeout(() => setDq(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setResults(null);
    // No query: show the catalogue's most-downloaded first, which is a better
    // starting shelf than whatever happens to be newest.
    const qs = new URLSearchParams({ limit: "30" });
    if (dq) qs.set("q", dq);
    else qs.set("sort", "most-downloaded");
    get<{ results: CourseSummary[] }>(`/courses?${qs.toString()}`)
      .then((d) => setResults(d.results))
      .catch(() => setResults([]));
  }, [dq]);

  const toggle = (id: string) => {
    if (single) {
      onAdd([id], (results ?? []).filter((r) => r.id === id));
      return;
    }
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="section-head" style={{ margin: 0 }}>
          <h2 style={{ fontSize: 16 }}>{heading}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="circle-search" style={{ margin: "12px 0" }}>
          <Search size={13} />
          <input
            autoFocus
            placeholder="Search the catalogue…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {results === null ? (
          <p className="muted" style={{ fontSize: 12 }}>Searching…</p>
        ) : results.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>
            {dq ? `Nothing matches “${dq}”.` : "The catalogue is empty."}
          </p>
        ) : (
          <div className="dark-panel" style={{ padding: 6, maxHeight: 340, overflowY: "auto" }}>
            {results.map((c) => {
              const owned = have.has(c.id);
              const on = picked.includes(c.id);
              return (
                <button
                  key={c.id}
                  className="lesson"
                  style={{ width: "100%", textAlign: "left", opacity: owned ? 0.55 : 1 }}
                  onClick={() => !owned && toggle(c.id)}
                  disabled={owned}
                  aria-pressed={on}
                >
                  <span
                    className={on || owned ? "icon-badge icon-badge--amber" : "icon-badge icon-badge--gray"}
                    style={{ width: 26, height: 26 }}
                  >
                    {on || owned ? <Check size={12} /> : <Plus size={12} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: "block", fontSize: 12 }}>{c.title}</strong>
                    <small className="muted">
                      {owned
                        ? "already in this list"
                        : c.ratingCount > 0
                          ? `★ ${c.ratingAvg.toFixed(1)} · ${c.level}`
                          : c.level}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="actions" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          {/* Single-pick commits on the row tap, so a confirm button would be a
              second click that does nothing. */}
          {!single && (
            <button
              className="btn primary"
              disabled={picked.length === 0 || busy}
              onClick={() => onAdd(picked, (results ?? []).filter((r) => picked.includes(r.id)))}
            >
              {busy ? "Adding…" : picked.length === 0 ? (cta ?? "Add courses") : `${cta ?? "Add"} ${picked.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
