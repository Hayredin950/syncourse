"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { get } from "@/lib/api";
import type { CourseSummary } from "@/lib/types";
import { CourseCard } from "./CourseCard";

const TYPE_TABS = [
  { label: "All", type: "" },
  { label: "Courses", type: "course" },
  { label: "Mini-courses", type: "mini-course" },
  { label: "Cheat-sheets", type: "cheat-sheet" },
  { label: "Roadmaps", type: "roadmap" },
];

/**
 * A rail with clickable content-type filter tabs (like PhonoFilm's
 * Movie / TV Show / Anime / Asian tabs on each home row) plus an optional
 * category dropdown. The active combination fetches its own slice from the
 * API; "All" shows the preloaded base list.
 */
export function FilteredRail({
  title,
  href,
  base,
  fetchPath,
  badgeNew = false,
  wide = false,
  categories,
}: {
  title: string;
  href?: string;
  base: CourseSummary[];
  /** Builds the API path for a content type + category, e.g. `/courses?sort=newest&contentType=course&category=web-development&limit=12` */
  fetchPath: (type: string, category: string) => string;
  badgeNew?: boolean;
  wide?: boolean;
  categories?: { name: string; slug: string }[];
}) {
  const [tab, setTab] = useState("");
  const [cat, setCat] = useState("");
  const [items, setItems] = useState<CourseSummary[]>(base);

  useEffect(() => {
    let alive = true;
    if (!tab && !cat) {
      setItems(base);
      return;
    }
    get<{ results: CourseSummary[] }>(fetchPath(tab, cat))
      .then((r) => alive && setItems(r.results))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [tab, cat, base, fetchPath]);

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center gap-2 px-4">
        <h2 className="text-base font-semibold text-text">{title}</h2>
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {TYPE_TABS.map((t) => (
            <button
              key={t.label}
              onClick={() => setTab(t.type)}
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                tab === t.type ? "bg-accent text-black" : "text-muted hover:bg-surface-hover hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {categories && categories.length > 0 && (
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="h-6 shrink-0 cursor-pointer rounded-full border border-border bg-surface px-2 text-[11px] text-muted outline-none focus:border-accent"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {href && (
          <Link href={href} className="ml-auto shrink-0 text-sm font-medium text-muted hover:text-text">
            See all &gt;
          </Link>
        )}
      </div>
      {/* mobile: horizontal scroll · desktop: wrap — no reserved dead space */}
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:flex-wrap md:gap-4 md:overflow-visible md:px-4 md:pb-2">
        {items.map((c) => (
          <CourseCard key={c.id} course={badgeNew ? { ...c, isNew: true } : c} wide={wide} />
        ))}
        {items.length === 0 && <div className="px-1 py-4 text-xs text-dim">No {tab || "courses"} here yet.</div>}
      </div>
    </section>
  );
}
