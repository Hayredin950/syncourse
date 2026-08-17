"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { get } from "@/lib/api";
import type { CourseSummary } from "@/lib/types";
import { CourseCard, CourseRow } from "@/components/CourseCard";
import { EmptyState } from "@/components/EmptyState";

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

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h1 className="text-lg font-bold text-text">Browse</h1>
        <button
          onClick={() => setShowFilters(true)}
          className="ml-auto rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:text-text"
        >
          Filters{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
        </button>
        <div className="flex overflow-hidden rounded-md border border-border">
          <button
            onClick={() => setView("grid")}
            className={`px-2 py-1 text-xs ${view === "grid" ? "bg-surface-raised text-text" : "text-dim"}`}
          >
            ▦
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-2 py-1 text-xs ${view === "list" ? "bg-surface-raised text-text" : "text-dim"}`}
          >
            ☰
          </button>
        </div>
      </div>

      <div className="px-4 py-2 text-xs text-muted">{total}+ results</div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No courses match those filters" body="Try removing a filter or two." />
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
          {results.map((c) => (
            <CourseCard key={c.id} course={c} fill />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1 px-3">
          {results.map((c) => (
            <CourseRow key={c.id} course={c} />
          ))}
        </div>
      )}

      {showFilters && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60" onClick={() => setShowFilters(false)}>
          <div
            className="max-h-[80vh] w-full max-w-[420px] overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-text">Filters</h2>
              <button onClick={() => setShowFilters(false)} className="text-sm text-muted hover:text-text">
                Done
              </button>
            </div>

            <FilterGroup title="Content type">
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <Chip key={t} active={type === t} onClick={() => setParam("type", type === t ? "" : t)}>
                    {t}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Category">
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <Chip key={c.slug} active={category === c.slug} onClick={() => setParam("category", category === c.slug ? "" : c.slug)}>
                    {c.name}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Level">
              <div className="flex flex-wrap gap-2">
                {LEVELS.map((l) => (
                  <Chip key={l} active={level === l} onClick={() => setParam("level", level === l ? "" : l)}>
                    {l}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Min rating">
              <div className="flex flex-wrap gap-2">
                {["", "4", "4.5", "4.8"].map((r) => (
                  <Chip key={r || "any"} active={minRating === r} onClick={() => setParam("minRating", minRating === r ? "" : r)}>
                    {r ? `${r}★+` : "Any"}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Sort">
              <div className="flex flex-wrap gap-2">
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
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">{title}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-accent text-black" : "bg-bg text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted">Loading…</div>}>
      <BrowseInner />
    </Suspense>
  );
}
