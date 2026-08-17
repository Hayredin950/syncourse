"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { get } from "@/lib/api";
import type { HomeData } from "@/lib/types";
import { CourseCard } from "@/components/CourseCard";
import { Rail } from "@/components/Rail";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/lib/auth";
import { compact, formatDuration, ratingColor } from "@/lib/format";

export default function HomePage() {
  const [home, setHome] = useState<HomeData | null>(null);
  const [error, setError] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    get<HomeData>("/home")
      .then(setHome)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="p-4">
        <EmptyState
          title="Can't reach the API"
          body="Start the backend with `npm run dev:api` (it serves on http://localhost:4000)."
        />
      </div>
    );
  }

  if (!home) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* type tabs */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-border px-4 py-2.5">
        {["All", "Courses", "Mini-courses", "Cheat-sheets", "Roadmaps"].map((t) => (
          <span key={t} className="shrink-0 rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted">
            {t}
          </span>
        ))}
      </div>

      {/* Trending */}
      <Rail title="Trending" href="/browse?sort=top-rated">
        {home.trending.slice(0, 12).map((c, i) => (
          <CourseCard key={c.id} course={c} rank={i + 1} />
        ))}
      </Rail>

      {/* Your Next Watch — recommendation module gated behind sign-in */}
      {!user ? (
        <div className="mx-4 mt-6 rounded-lg border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-text">Your Next Watch</div>
          <p className="mt-1 text-xs text-muted">
            Sign in, then watch and rate what you love. Syncourse learns the lecturers, topics and categories you
            gravitate to, then gives you a fresh set of picks every day.
          </p>
          <Link
            href="/auth"
            className="mt-3 inline-block rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-black hover:bg-accent-hover"
          >
            Sign in &gt;
          </Link>
        </div>
      ) : (
        <Rail title="Your Next Watch">
          {home.topRated.slice(0, 8).map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </Rail>
      )}

      {/* Latest */}
      <Rail title="Latest" href="/browse">
        {home.latest.slice(0, 12).map((c) => (
          <CourseCard key={c.id} course={{ ...c, isNew: true }} />
        ))}
      </Rail>

      {/* Top Rated */}
      <Rail title="Top Rated" href="/browse?sort=top-rated">
        {home.topRated.slice(0, 12).map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </Rail>

      {/* Best of {org} */}
      {home.bestOf.map(
        (org) =>
          org.courses.length > 0 && (
            <Rail key={org.id} title={`Best of ${org.name}`} href={`/browse?organization=${org.slug}`}>
              {org.courses.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </Rail>
          ),
      )}

      {/* Featured Paths */}
      <Rail title="Featured Learning Paths" href="/browse">
        {home.featuredPaths.map((p) => (
          <Link
            key={p.id}
            href="/browse"
            className="block w-[170px] shrink-0 overflow-hidden rounded-lg border border-border bg-surface md:w-auto"
          >
            <div className="flex aspect-[16/9] items-center justify-center bg-surface-raised text-2xl">🗺️</div>
            <div className="p-2">
              <div className="line-clamp-1 text-[13px] font-semibold text-text">{p.title}</div>
              <div className="mt-0.5 text-[11px] text-muted">
                {p.courseCount} courses · ★ {p.ratingAvg.toFixed(1)} avg
              </div>
            </div>
          </Link>
        ))}
      </Rail>

      {/* Categories */}
      <Rail title="Categories" href="/browse">
        {home.categories.map((c) => (
          <Link
            key={c.id}
            href={`/browse?category=${c.slug}`}
            className="flex w-[140px] shrink-0 flex-col items-center gap-1 rounded-lg border border-border bg-surface px-3 py-4 md:w-auto"
          >
            <span className="text-2xl">{c.icon}</span>
            <span className="line-clamp-1 text-xs font-medium text-text">{c.name}</span>
            <span className="text-[10px] text-dim">{c.courseCount} courses</span>
          </Link>
        ))}
      </Rail>

      {/* Lecturers */}
      <Rail title="Lecturers" href="/browse">
        {home.lecturers.map((l) => (
          <Link
            key={l.id}
            href={`/browse?lecturer=${l.slug}`}
            className="flex w-[110px] shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-3 text-center md:w-auto"
          >
            <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-surface-raised text-lg font-bold text-accent">
              {l.name.charAt(0)}
            </span>
            <span className="line-clamp-1 text-xs font-medium text-text">{l.name}</span>
            <span className="text-[10px] text-dim">{l.courseCount} courses</span>
          </Link>
        ))}
      </Rail>

      {/* Organizations */}
      <Rail title="Channels & Schools" href="/browse">
        {home.organizations.map((o) => (
          <Link
            key={o.id}
            href={`/browse?organization=${o.slug}`}
            className="flex w-[150px] shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-3 md:w-auto"
          >
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-raised text-sm font-bold text-accent">
              {o.name.charAt(0)}
            </span>
            <div className="min-w-0">
              <div className="line-clamp-1 text-xs font-semibold text-text">{o.name}</div>
              <div className="text-[10px] text-dim">
                {compact(o.subscribers)} subscribers · {o.courseCount} courses
              </div>
            </div>
          </Link>
        ))}
      </Rail>

      {/* stats line on cards */}
      <div className="px-4 pt-4 text-[11px] text-dim">
        {home.trending.length} trending · {home.latest.length} latest · {home.topRated.length} top rated
      </div>
    </div>
  );
}
