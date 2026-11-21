"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Filter, LayoutGrid, Search, SlidersHorizontal, Zap } from "lucide-react";
import { get } from "@/lib/api";
import { plural } from "@/lib/format";
import type { CourseSummary } from "@/lib/types";
import { CourseCard, CourseRow } from "@/components/CourseCard";
import AutoLoadMore from "@/components/AutoLoadMore";
import Modal from "@/components/Modal";
import { MobileHeader } from "@/components/Nav";
import { BrowseTabs } from "@/components/BrowseTabs";
import { SkGrid } from "@/components/Skeleton";
import { LoadError } from "@/components/LoadError";

const LEVELS = ["All Levels", "Beginner", "Intermediate", "Advanced"];
// Courses only — cheat-sheets, roadmaps and notes are Resources with their own
// index at /resources, so filtering the catalogue to either returned nothing.
const TYPES = ["course", "mini-course"];
/** One page of the grid. The API caps at 100, so this is a calm first screen. */
const BROWSE_PAGE = 24;
/** The tab strip that replaced the site-wide second nav row. */
const TYPE_TABS = [
  { value: "course", label: "Courses", icon: BookOpen },
  { value: "mini-course", label: "Mini-courses", icon: Zap },
] as const;
const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "top-rated", label: "Top rated" },
  { value: "most-downloaded", label: "Most downloaded" },
  { value: "a-z", label: "A–Z" },
];

function BrowseInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [results, setResults] = useState<CourseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  /* `results` staying `[]` after a dropped request is indistinguishable from a
     search that genuinely matched nothing, so the page blamed the filters. */
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [categories, setCategories] = useState<{ name: string; slug: string }[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [pageBusy, setPageBusy] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  // The search box filters the catalogue as you type, not only on Enter. The
  // API already understands `q`, so this is the same filter panel with one
  // more key — every page of results, not just the 24 on screen.
  const [q, setQ] = useState(params.get("q") ?? "");
  const [search, setSearch] = useState(q);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q.trim()), 260);
    return () => clearTimeout(timer);
  }, [q]);

  const category = params.get("category") ?? "";
  const level = params.get("level") ?? "";
  const sort = params.get("sort") ?? "newest";
  const minRating = params.get("minRating") ?? "";
  const type = params.get("type") ?? "";
  const organization = params.get("organization") ?? "";
  const lecturer = params.get("lecturer") ?? "";

  /** The filter combination the visible list belongs to. `loadMore` captures it
      and refuses to append a page that was requested under a different one. */
  const filtersKey = [category, level, sort, minRating, type, organization, lecturer, search].join("|");
  const filtersKeyRef = useRef(filtersKey);

  useEffect(() => {
    get<{ name: string; slug: string }[]>("/categories").then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    filtersKeyRef.current = [category, level, sort, minRating, type, organization, lecturer, search].join("|");
    setLoading(true);
    setFailed(false);
    setMoreFailed(false);
    setPageBusy(false);
    const qs = new URLSearchParams();
    if (category) qs.set("category", category);
    if (level) qs.set("level", level);
    if (sort) qs.set("sort", sort);
    if (minRating) qs.set("minRating", minRating);
    if (type) qs.set("contentType", type);
    if (organization) qs.set("organization", organization);
    if (lecturer) qs.set("lecturer", lecturer);
    if (search) qs.set("q", search);
    qs.set("limit", String(BROWSE_PAGE));
    qs.set("offset", "0");
    let cancelled = false;
    get<{ total: number; counts?: Record<string, number>; results: CourseSummary[] }>(`/courses?${qs.toString()}`)
      .then((d) => {
        if (cancelled) return;
        setResults(d.results);
        setTotal(d.total);
        // Counts arrive with the page and ignore the type filter, so the strip is
        // stable as you move between tabs. An older API build omits them; the
        // tabs then simply carry no numbers rather than showing zeros.
        if (d.counts) setCounts(d.counts);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, level, sort, minRating, type, organization, lecturer, search, retry]);

  /**
   * The page used to request 60 and call that the catalogue. Anything past the
   * first 60 courses was unreachable from Browse, and the header said "60+" to
   * paper over it. Now the API reports the real total and pages.
   */
  const loadMore = () => {
    if (loading || pageBusy || results.length >= total) return;
    const key = [category, level, sort, minRating, type, organization, lecturer, search].join("|");
    const qs = new URLSearchParams();
    if (category) qs.set("category", category);
    if (level) qs.set("level", level);
    if (sort) qs.set("sort", sort);
    if (minRating) qs.set("minRating", minRating);
    if (type) qs.set("contentType", type);
    if (organization) qs.set("organization", organization);
    if (lecturer) qs.set("lecturer", lecturer);
    if (search) qs.set("q", search);
    qs.set("limit", String(BROWSE_PAGE));
    qs.set("offset", String(results.length));
    setPageBusy(true);
    setMoreFailed(false);
    get<{ total: number; results: CourseSummary[] }>(`/courses?${qs.toString()}`)
      .then((d) => {
        // A filter change while this page was in flight replaces the results;
        // appending the old page to the new list would mix two catalogues.
        if (key !== filtersKeyRef.current) return;
        setResults((prev) => [...prev, ...d.results]);
        setTotal(d.total);
      })
      .catch(() => setMoreFailed(true))
      .finally(() => setPageBusy(false));
  };

  const activeFilterCount = useMemo(
    () => [category, level, minRating, type, organization, lecturer].filter(Boolean).length,
    [category, level, minRating, type, organization, lecturer],
  );

  /** Every filter the sheet owns, so "Clear all" is one navigation and not six. */
  const clearFilters = () => {
    const next = new URLSearchParams(params.toString());
    for (const k of ["category", "level", "minRating", "type", "organization", "lecturer"]) next.delete(k);
    router.push(next.toString() ? `/browse?${next.toString()}` : "/browse");
  };

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/browse?${next.toString()}`);
  };

  const heading = category
    ? category.replaceAll("-", " ")
    : type
      ? `${type}s`
      : sort === "top-rated"
        ? "Top rated"
        : "Courses";

  return (
    <main className="page">
      <MobileHeader title="Browse" />
      <BrowseTabs />

      <div className="page-head">
        <div className="page-head__main">
          <span className="eyebrow">{category ? "Topic index" : "Library index"}</span>
          <h1 className="display page-head__title" style={{ textTransform: "capitalize" }}>{heading}</h1>
          <p className="muted mono" style={{ fontSize: 11, margin: 0 }}>{plural(total, "result")}</p>
        </div>
        <button className="btn" onClick={() => setShowFilters(true)}>
          <Filter size={14} /> Filters{" "}
          <span className="badge" style={{ padding: "2px 7px", marginLeft: 4 }}>{activeFilterCount}</span>
        </button>
      </div>

      {/* The content-type tabs the top bar used to carry. Here they can show what
          each one holds, and they only affect the page you are looking at. */}
      <div className="res-tabs" role="tablist" aria-label="Content type" style={{ margin: "18px 0 2px" }}>
        <button
          type="button"
          role="tab"
          aria-selected={!type}
          className={`res-tab ${type ? "" : "active"}`}
          onClick={() => setParam("type", "")}
        >
          <LayoutGrid size={13} /> All
          {counts.all ? <b>{counts.all}</b> : null}
        </button>
        {TYPE_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={type === t.value}
            className={`res-tab ${type === t.value ? "active" : ""}`}
            onClick={() => setParam("type", type === t.value ? "" : t.value)}
          >
            <t.icon size={13} /> {t.label}
            {counts[t.value] ? <b>{counts[t.value]}</b> : null}
          </button>
        ))}
      </div>

      <div className="filters">
        <input
          className="filter-search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLoading(true);
          }}
          placeholder="Search courses as you type — or press Enter for ranked search"
          aria-label="Search these courses"
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              router.push(`/search?q=${encodeURIComponent(q.trim())}`);
            }
          }}
        />
        <div className="pills">
          {categories.slice(0, 8).map((c) => (
            <button
              key={c.slug}
              className={`badge ${category === c.slug ? "primary" : ""}`}
              onClick={() => setParam("category", category === c.slug ? "" : c.slug)}
            >
              {c.name}
            </button>
          ))}
          <button className="badge" onClick={() => setView(view === "grid" ? "list" : "grid")}>
            <SlidersHorizontal size={13} /> {view === "grid" ? "Grid" : "List"}
          </button>
        </div>
      </div>

      {loading ? (
        <SkGrid n={12} label="Loading courses" />
      ) : failed ? (
        /* Was the "No courses match that search" panel below, which blames the
           reader's filters for a request that never came back. */
        <LoadError
          title="We couldn't load the catalogue"
          body="Your filters are fine — the request to our servers failed. Try again."
          onRetry={() => setRetry((n) => n + 1)}
        />
      ) : results.length === 0 ? (
        <div className="dark-panel dark-panel--pad-xl" style={{ textAlign: "center" }}>
          <Search size={28} className="rating" />
          <h3>No courses match that search.</h3>
          <p className="muted">Try a broader topic or clear your filters.</p>
          <button className="btn" onClick={() => router.push("/browse")}>Clear filters</button>
        </div>
      ) : view === "grid" ? (
        <div className="grid">
          {results.map((c) => (
            <CourseCard key={c.id} course={c} fill />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {results.map((c) => (
            <CourseRow key={c.id} course={c} />
          ))}
        </div>
      )}

      {!loading && !failed && results.length > 0 && results.length < total && (
        <div className="s-more">
          <AutoLoadMore
            onLoad={loadMore}
            disabled={pageBusy || moreFailed}
            resetKey={`${filtersKey}:${results.length}`}
          />
          <button type="button" className="btn" onClick={loadMore} disabled={pageBusy}>
            {pageBusy
              ? "Loading…"
              : `Load ${Math.min(BROWSE_PAGE, total - results.length)} more · ${total - results.length} left`}
          </button>
          {moreFailed && (
            <span className="s-more__note">Couldn’t load the next page — try again.</span>
          )}
        </div>
      )}

      {showFilters && (
        /* The count in the footer is the point of the sheet: every chip navigates
           immediately, so you can watch the result total move as you narrow, and
           the button that dismisses it says what you are going back to. */
        <Modal
          open
          onClose={() => setShowFilters(false)}
          title="Filters"
          subtitle={activeFilterCount === 0 ? "Nothing narrowed yet." : `${plural(activeFilterCount, "filter")} on`}
          width={480}
          footer={
            <div className="sheet-foot__row">
              <button type="button" className="btn" onClick={clearFilters} disabled={activeFilterCount === 0}>
                Clear all
              </button>
              <button type="button" className="btn primary btn--grow" onClick={() => setShowFilters(false)}>
                {loading ? "Showing…" : `Show ${plural(total, "result")}`}
              </button>
            </div>
          }
        >
            <FilterGroup title="Content type">
              <div className="pills">
                {TYPES.map((t) => (
                  <Chip key={t} active={type === t} onClick={() => setParam("type", type === t ? "" : t)}>
                    {t}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Category">
              <div className="pills">
                {categories.map((c) => (
                  <Chip key={c.slug} active={category === c.slug} onClick={() => setParam("category", category === c.slug ? "" : c.slug)}>
                    {c.name}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Level">
              <div className="pills">
                {LEVELS.map((l) => (
                  <Chip key={l} active={level === l} onClick={() => setParam("level", level === l ? "" : l)}>
                    {l}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Min rating">
              <div className="pills">
                {["", "4", "4.5", "4.8"].map((r) => (
                  <Chip key={r || "any"} active={minRating === r} onClick={() => setParam("minRating", minRating === r ? "" : r)}>
                    {r ? `${r}★+` : "Any"}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Sort" last>
              <div className="pills">
                {SORTS.map((s) => (
                  <Chip key={s.value} active={sort === s.value} onClick={() => setParam("sort", sort === s.value ? "newest" : s.value)}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </FilterGroup>
        </Modal>
      )}
    </main>
  );
}

/** `last` drops the trailing gap so the sheet body's own padding is the only
    space under the final group. */
function FilterGroup({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 18 }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", color: "#c79b62", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`badge ${active ? "primary" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <SkGrid n={12} label="Loading the library" />
        </main>
      }
    >
      <BrowseInner />
    </Suspense>
  );
}
