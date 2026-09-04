"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Search, Sparkles, X } from "lucide-react";
import { get } from "@/lib/api";
import type { ResourceList, ResourceSummary } from "@/lib/types";
import { MobileHeader } from "@/components/Nav";
import { BrowseTabs } from "@/components/BrowseTabs";
import { ResourceCard, ResourceFeature, typeMeta } from "@/components/ResourceCard";
import { SkCards } from "@/components/Skeleton";

/**
 * The resource library — cheat-sheets, roadmaps and useful notes.
 *
 * Split off from /browse because these are not courses: there is no level, no
 * duration and no curriculum to filter on, and the thing a reader wants to know
 * is what kind of document it is and what came attached to it. Filters live in
 * the URL so a filtered view is a shareable link.
 */

const PER_PAGE = 24;
const TYPE_ORDER = ["cheat-sheet", "roadmap", "note"];
const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most read" },
  { value: "a-z", label: "A–Z" },
];

type Filters = { type: string; q: string; category: string; tag: string; sort: string };

function ResourcesInner() {
  const router = useRouter();
  const params = useSearchParams();

  // Read the URL once, then own the state: reading it every render and writing
  // it back from an effect is how a filter bar starts fighting itself.
  const [f, setF] = useState<Filters>(() => ({
    type: params.get("type") ?? "",
    q: params.get("q") ?? "",
    category: params.get("category") ?? "",
    tag: params.get("tag") ?? "",
    sort: params.get("sort") ?? "newest",
  }));
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<ResourceSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<ResourceList["categories"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  /** Changing a filter always returns to the first page. */
  const apply = (patch: Partial<Filters>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setOffset(0);
  };

  useEffect(() => {
    const qs = new URLSearchParams();
    if (f.type) qs.set("type", f.type);
    if (f.q) qs.set("q", f.q);
    if (f.category) qs.set("category", f.category);
    if (f.tag) qs.set("tag", f.tag);
    if (f.sort !== "newest") qs.set("sort", f.sort);
    const next = qs.toString();
    router.replace(next ? `/resources?${next}` : "/resources", { scroll: false });
  }, [f, router]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // Typing shouldn't fire a request per keystroke; a filter click shouldn't wait.
    const timer = setTimeout(
      () => {
        const qs = new URLSearchParams();
        if (f.type) qs.set("type", f.type);
        if (f.q) qs.set("q", f.q);
        if (f.category) qs.set("category", f.category);
        if (f.tag) qs.set("tag", f.tag);
        qs.set("sort", f.sort);
        qs.set("limit", String(PER_PAGE));
        qs.set("offset", String(offset));
        get<ResourceList>(`/resources?${qs.toString()}`)
          .then((d) => {
            if (!alive) return;
            setItems((prev) => (offset === 0 ? d.results : [...prev, ...d.results]));
            setTotal(d.total);
            setCounts(d.counts);
            setCategories(d.categories ?? []);
            setError(false);
          })
          .catch(() => alive && setError(true))
          .finally(() => alive && setLoading(false));
      },
      f.q ? 300 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [f, offset]);

  const libraryTotal = useMemo(
    () => Object.values(counts).reduce((a, b) => a + b, 0),
    [counts],
  );
  const narrowed = Boolean(f.q || f.category || f.tag);
  // Editors mark these with the Featured switch. Only worth a wide card on the
  // unfiltered view — inside a search the reader already knows what they want.
  const featured = useMemo(
    () => (narrowed ? [] : items.filter((r) => r.isFeatured).slice(0, 2)),
    [items, narrowed],
  );
  const featuredIds = useMemo(() => new Set(featured.map((r) => r.id)), [featured]);
  const grid = useMemo(() => items.filter((r) => !featuredIds.has(r.id)), [items, featuredIds]);

  return (
    <main className="page">
      <MobileHeader title="Browse" />
      <BrowseTabs />

      <header className="res-head">
        <span className="eyebrow">Library · reference</span>
        <h1 className="display" style={{ fontSize: "clamp(30px,3.6vw,44px)", marginBottom: 8 }}>
          Resources
        </h1>
        <p className="muted res-head__lede">
          Cheat-sheets, roadmaps and the notes worth keeping. Each one is published in full here — read it
          on the page, then take the files with you.
        </p>
        <p className="mono res-head__count">
          {libraryTotal.toLocaleString("en-US")} published
          {TYPE_ORDER.filter((t) => counts[t]).map((t) => (
            <span key={t}> · {counts[t]} {typeMeta(t).plural.toLowerCase()}</span>
          ))}
        </p>
      </header>

      <div className="res-toolbar">
        <div className="res-tabs" role="tablist" aria-label="Resource type">
          <button
            type="button"
            role="tab"
            aria-selected={!f.type}
            className={`res-tab ${f.type ? "" : "active"}`}
            onClick={() => apply({ type: "" })}
          >
            <LayoutGrid size={13} /> All
            {libraryTotal > 0 && <b>{libraryTotal}</b>}
          </button>
          {TYPE_ORDER.map((t) => {
            const meta = typeMeta(t);
            const Icon = meta.icon;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={f.type === t}
                className={`res-tab ${f.type === t ? "active" : ""}`}
                onClick={() => apply({ type: f.type === t ? "" : t })}
              >
                <Icon size={13} /> {meta.plural}
                {counts[t] ? <b>{counts[t]}</b> : null}
              </button>
            );
          })}
        </div>
        <div className="res-toolbar__end">
          <span className="res-search">
            <Search size={14} />
            <input
              value={f.q}
              onChange={(e) => apply({ q: e.target.value })}
              placeholder="Search titles, text and tags…"
              aria-label="Search resources"
            />
            {f.q && (
              <button type="button" className="res-search__clear" onClick={() => apply({ q: "" })} aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </span>
          <select
            className="res-select"
            value={f.sort}
            onChange={(e) => apply({ sort: e.target.value })}
            aria-label="Sort resources"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(categories.length > 0 || f.tag) && (
        <div className="res-pills">
          {f.tag && (
            <button type="button" className="badge primary" onClick={() => apply({ tag: "" })}>
              #{f.tag} <X size={11} />
            </button>
          )}
          {categories.map((c) => (
            <button
              key={c.slug}
              type="button"
              className={`badge ${f.category === c.slug ? "primary" : ""}`}
              onClick={() => apply({ category: f.category === c.slug ? "" : c.slug })}
            >
              {c.icon ? `${c.icon} ` : ""}
              {c.name} <span className="mono res-pills__n">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {featured.length > 0 && (
        <section className="res-featured">
          <div className="section-head">
            <h2>
              <Sparkles size={14} style={{ verticalAlign: "middle", color: "hsl(var(--primary))" }} /> Editor&apos;s picks
            </h2>
          </div>
          <div className={`res-feature-row ${featured.length === 1 ? "res-feature-row--one" : ""}`}>
            {featured.map((r) => (
              <ResourceFeature key={r.id} resource={r} />
            ))}
          </div>
        </section>
      )}

      <section className="res-results">
        {loading && items.length === 0 ? (
          <SkCards n={8} grid="res-grid" label="Loading the library" />
        ) : error ? (
          <div className="dark-panel res-empty">
            <h3>The library could not be loaded.</h3>
            <p className="muted">The API did not answer. Reload the page to try again.</p>
          </div>
        ) : grid.length === 0 ? (
          <div className="dark-panel res-empty">
            <Search size={26} style={{ color: "hsl(var(--primary))" }} />
            <h3>{narrowed || f.type ? "Nothing matches that." : "Nothing published yet."}</h3>
            <p className="muted">
              {narrowed || f.type
                ? "Try a broader search, or clear the filters."
                : "Cheat-sheets, roadmaps and notes published in the admin console appear here straight away."}
            </p>
            {(narrowed || f.type) && (
              <button
                className="btn"
                onClick={() => apply({ type: "", q: "", category: "", tag: "", sort: "newest" })}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="res-grid">
              {grid.map((r) => (
                <ResourceCard key={r.id} resource={r} />
              ))}
            </div>
            {items.length < total && (
              <div className="res-more">
                <button className="btn" disabled={loading} onClick={() => setOffset(items.length)}>
                  {loading ? "Loading…" : `Show more (${total - items.length} left)`}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <p className="muted res-foot">
        Looking for a full course instead? <Link href="/browse">Browse the catalogue</Link>.
      </p>
    </main>
  );
}

/** `useSearchParams` suspends, and the app is a static export — so it needs a boundary. */
export default function ResourcesPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <SkCards n={8} grid="res-grid" label="Loading the library" />
        </main>
      }
    >
      <ResourcesInner />
    </Suspense>
  );
}
