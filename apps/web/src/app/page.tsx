"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { get } from "@/lib/api";
import type { HomeData, LearningData } from "@/lib/types";
import { CourseCard } from "@/components/CourseCard";
import { Rail } from "@/components/Rail";
import { FilteredRail } from "@/components/FilteredRail";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const [home, setHome] = useState<HomeData | null>(null);
  const [learning, setLearning] = useState<LearningData | null>(null);
  const [error, setError] = useState(false);
  const { user } = useAuth();

  // Trending period tabs — Day / Week / Month (client-side slice of the rails)
  const [trendTab, setTrendTab] = useState<"day" | "week" | "month">("day");

  useEffect(() => {
    get<HomeData>("/home")
      .then(setHome)
      .catch(() => setError(true));
  }, []);

  // Signed-in users get real progress numbers in "Your Next Watch"
  useEffect(() => {
    if (user) get<LearningData>("/learning").then(setLearning).catch(() => undefined);
  }, [user]);

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

  const trendSource =
    trendTab === "day" ? home.trending : trendTab === "week" ? home.topRated : home.latest;

  const catOptions = home.categories.map((c) => ({ name: c.name, slug: c.slug }));

  const inProgress = learning?.counts?.inProgress ?? 0;
  const completed = learning?.counts?.completed ?? 0;
  const totalEnrolled = inProgress + completed;

  return (
    <div className="pb-6">
      {/* type tabs — filter links into Browse; desktop gets these in the sidebar */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-border px-4 py-2.5 lg:hidden">
        {[
          { label: "All", type: "" },
          { label: "Courses", type: "course" },
          { label: "Mini-courses", type: "mini-course" },
          { label: "Cheat-sheets", type: "cheat-sheet" },
          { label: "Roadmaps", type: "roadmap" },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.type ? `/browse?type=${t.type}` : "/browse"}
            className="shrink-0 rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted transition-colors hover:text-text"
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Latest — hero carousel of new courses with "Added" badges */}
      <FilteredRail
        title="Latest"
        href="/browse"
        base={home.latest}
        fetchPath={(type, cat) =>
          `/courses?sort=newest&limit=10${type ? `&contentType=${type}` : ""}${cat ? `&category=${cat}` : ""}`
        }
        badgeNew
        wide
        categories={catOptions}
      />

      {/* Trending — ranked, with Day/Week/Month tabs */}
      <section className="mt-6">
        <div className="mb-2 flex items-center gap-2 px-4">
          <h2 className="text-base font-semibold text-text">Trending</h2>
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {(["day", "week", "month"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setTrendTab(p)}
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors ${
                  trendTab === p ? "bg-accent text-black" : "text-muted hover:bg-surface-hover hover:text-text"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Link href="/browse?sort=top-rated" className="ml-auto shrink-0 text-sm font-medium text-muted hover:text-text">
            See all &gt;
          </Link>
        </div>
        <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:flex-wrap md:gap-4 md:overflow-visible md:px-4 md:pb-2">
          {trendSource.slice(0, 12).map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      </section>

      {/* Your Next Watch — personalized nudge with progress */}
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
        <div className="mx-4 mt-6 rounded-lg border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-text">Your Next Watch</div>
          <p className="mt-1 text-xs text-muted">
            You&apos;re almost there — continue where you left off and rate what you learn. That&apos;s how Syncourse
            learns your taste.
          </p>
          <div className="mt-3 space-y-2">
            <ProgressRow label="In progress" value={inProgress} total={totalEnrolled} />
            <ProgressRow label="Completed" value={completed} total={totalEnrolled} />
          </div>
          <Link
            href="/my-learning"
            className="mt-3 inline-block rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-black hover:bg-accent-hover"
          >
            Continue learning &gt;
          </Link>
        </div>
      )}

      {/* Top Rated — with type tabs + category dropdown */}
      <FilteredRail
        title="Top Rated"
        href="/browse?sort=top-rated"
        base={home.topRated}
        fetchPath={(type, cat) =>
          `/courses?sort=top-rated&limit=10${type ? `&contentType=${type}` : ""}${cat ? `&category=${cat}` : ""}`
        }
        categories={catOptions}
      />

      {/* Best of {org} */}
      {home.bestOf.map(
        (org) =>
          org.courses.length > 0 && (
            <Rail key={org.id} title={`Best of ${org.name}`} href={`/organizations/${org.slug}`}>
              {org.courses.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </Rail>
          ),
      )}

      {/* Featured Learning Paths — franchise-style wide cards */}
      <Rail title="Featured Learning Paths" href="/browse">
        {home.featuredPaths.map((p) => (
          <Link
            key={p.id}
            href="/browse"
            className="group block w-[230px] min-w-0 shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-surface md:w-[250px]"
          >
            <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-surface-raised text-3xl">
              🗺️
              {p.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
            </div>
            <div className="p-3">
              <div className="line-clamp-1 text-sm font-semibold text-text">{p.title}</div>
              {p.description && (
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{p.description}</div>
              )}
              <div className="mt-1.5 text-[11px] text-dim">
                {p.courseCount} courses · ★ {p.ratingAvg.toFixed(1)} avg · {p.totalVotes.toLocaleString()} votes
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
            className="flex w-[140px] shrink-0 flex-col items-center gap-1 rounded-lg border border-border bg-surface px-3 py-4"
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
            href={`/lecturers/${l.slug}`}
            className="flex w-[110px] shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-3 text-center"
          >
            <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-surface-raised text-lg font-bold text-accent">
              {l.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                l.name.charAt(0)
              )}
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
            href={`/organizations/${o.slug}`}
            className="flex w-[150px] shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-3"
          >
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-raised text-sm font-bold text-accent">
              {o.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                o.name.charAt(0)
              )}
            </span>
            <div className="min-w-0">
              <div className="line-clamp-1 text-xs font-semibold text-text">{o.name}</div>
              <div className="text-[10px] text-dim">
                {o.subscribers.toLocaleString()} subscribers · {o.courseCount} courses
              </div>
            </div>
          </Link>
        ))}
      </Rail>

      {/* Load More */}
      <div className="px-4 pt-6">
        <Link
          href="/browse"
          className="block w-full rounded-full border border-border py-2.5 text-center text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          Load More
        </Link>
      </div>
    </div>
  );
}

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span>
          {value}
          {total > 0 ? `/${total}` : ""}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
