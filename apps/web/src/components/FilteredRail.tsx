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
 * Movie / TV Show / Anime / Asian tabs on each home row). The active tab
 * fetches its own slice of courses from the API; "All" shows the preloaded
 * base list.
 */
export function FilteredRail({
  title,
  href,
  base,
  fetchPath,
  badgeNew = false,
}: {
  title: string;
  href?: string;
  base: CourseSummary[];
  /** Builds the API path for a specific content type, e.g. `/courses?sort=newest&contentType=course&limit=12` */
  fetchPath: (type: string) => string;
  badgeNew?: boolean;
}) {
  const [tab, setTab] = useState("");
  const [items, setItems] = useState<CourseSummary[]>(base);

  useEffect(() => {
    if (!tab) {
      setItems(base);
      return;
    }
    let alive = true;
    get<{ results: CourseSummary[] }>(fetchPath(tab))
      .then((r) => alive && setItems(r.results))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [tab, base, fetchPath]);

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
        {href && (
          <Link href={href} className="ml-auto shrink-0 text-sm font-medium text-muted hover:text-text">
            See all &gt;
          </Link>
        )}
      </div>
      <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:grid md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] md:gap-4 md:overflow-visible md:px-4 md:pb-2">
        {items.map((c) => (
          <CourseCard key={c.id} course={badgeNew ? { ...c, isNew: true } : c} />
        ))}
        {items.length === 0 && <div className="px-1 py-4 text-xs text-dim">No {tab || "courses"} here yet.</div>}
      </div>
    </section>
  );
}
