"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { get } from "@/lib/api";
import type { CourseSummary } from "@/lib/types";
import { CourseCard, CourseRow } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";

const LEVELS = ["All Levels", "Beginner", "Intermediate", "Advanced"];
const TYPES = ["course", "mini-course", "cheat-sheet", "roadmap"];
const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "top-rated", label: "Top rated" },
  { value: "most-enrolled", label: "Most enrolled" },
  { value: "a-z", label: "A–Z" },
];

function BrowseInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [results, setResults] = useState<CourseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [categories, setCategories] = useState<{ name: string; slug: string }[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const category = params.get("category") ?? "";
  const level = params.get("level") ?? "";
  const sort = params.get("sort") ?? "newest";
  const minRating = params.get("minRating") ?? "";
  const type = params.get("type") ?? "";
  const organization = params.get("organization") ?? "";
  const lecturer = params.get("lecturer") ?? "";

  useEffect(() => {
    get<{ name: string; slug: string }[]>("/categories").then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (category) qs.set("category", category);
    if (level) qs.set("level", level);
    if (sort) qs.set("sort", sort);
    if (minRating) qs.set("minRating", minRating);
    if (type) qs.set("contentType", type);
    if (organization) qs.set("organization", organization);
    if (lecturer) qs.set("lecturer", lecturer);
    qs.set("limit", "60");
    get<{ total: number; results: CourseSummary[] }>(`/courses?${qs.toString()}`)
      .then((d) => {
        setResults(d.results);
        setTotal(d.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category, level, sort, minRating, type, organization, lecturer]);

  const activeFilterCount = useMemo(
    () => [category, level, minRating, type, organization, lecturer].filter(Boolean).length,
    [category, level, minRating, type, organization, lecturer],
  );

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
        : "Browse";

  return (
    <main className="page">
      <MobileHeader title="Browse" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}>
        <div>
          <span className="eyebrow">{category ? "Topic index" : "Library index"}</span>
          <h1 className="display" style={{ fontSize: 38, marginBottom: 5, textTransform: "capitalize" }}>{heading}</h1>
          <p className="muted mono" style={{ fontSize: 11, margin: 0 }}>{total}+ results</p>
        </div>
        <button className="btn" onClick={() => setShowFilters(true)}>
          <Filter size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Filters{" "}
          <span className="badge" style={{ padding: "2px 7px", marginLeft: 4 }}>{activeFilterCount}</span>
        </button>
      </div>

      <div className="filters">
        <input
          className="filter-search"
          placeholder="Search this catalog"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.currentTarget.value.trim()) {
              router.push(`/search?q=${encodeURIComponent(e.currentTarget.value.trim())}`);
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
        <div className="grid">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="dark-panel" style={{ padding: 40, textAlign: "center" }}>
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

      {showFilters && (
        <div className="sheet" onClick={() => setShowFilters(false)}>
          <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h3>Filters</h3>
              <button className="icon-btn" onClick={() => setShowFilters(false)}><X size={15} /></button>
            </div>

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

            <FilterGroup title="Sort">
              <div className="pills">
                {SORTS.map((s) => (
                  <Chip key={s.value} active={sort === s.value} onClick={() => setParam("sort", sort === s.value ? "newest" : s.value)}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </FilterGroup>
          </div>
        </div>
      )}
    </main>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
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
    <Suspense fallback={<main className="page"><p className="muted">Loading…</p></main>}>
      <BrowseInner />
    </Suspense>
  );
}
