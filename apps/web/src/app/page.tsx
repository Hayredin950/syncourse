"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Play, Star } from "lucide-react";
import { get } from "@/lib/api";
import type { CourseSummary, HomeData, LibraryData } from "@/lib/types";
import { CourseCard } from "@/components/CourseCard";
import { LecturerCard, PublisherCard } from "@/components/EntityCard";
import { HomeCollections } from "@/components/HomeCollections";
import { HomeResources } from "@/components/HomeResources";
import { MobileHeader } from "@/components/Nav";
import { useAuth } from "@/lib/auth";
import { formatDuration } from "@/lib/format";

export default function HomePage() {
  const [home, setHome] = useState<HomeData | null>(null);
  const [library, setLibrary] = useState<LibraryData | null>(null);
  const [error, setError] = useState(false);
  const { user } = useAuth();

  // Trending period tabs — Day / Week / Month (PhonoFilm pattern)
  const [trendTab, setTrendTab] = useState<"day" | "week" | "month">("day");

  // "Best of" — one row with a dropdown to switch organizations
  const [bestOfOrgId, setBestOfOrgId] = useState("");
  useEffect(() => {
    if (bestOfOrgId || !home || home.bestOf.length === 0) return;
    setBestOfOrgId(home.bestOf[0].id);
  }, [home, bestOfOrgId]);
  const activeOrg = home?.bestOf.find((o) => o.id === bestOfOrgId) ?? home?.bestOf[0];

  // Curated rows with dropdowns (PhonoFilm: Movie Genre → / Directors →)
  const [catRowSlug, setCatRowSlug] = useState("");
  const [instructorRowSlug, setInstructorRowSlug] = useState("");
  const [catRowCourses, setCatRowCourses] = useState<CourseSummary[]>([]);
  const [instructorRowCourses, setInstructorRowCourses] = useState<CourseSummary[]>([]);
  const catRow = home?.categories.find((c) => c.slug === catRowSlug) ?? home?.categories[0];
  const instructorRow = home?.lecturers.find((l) => l.slug === instructorRowSlug) ?? home?.lecturers[0];
  useEffect(() => {
    if (!catRow) return;
    get<{ results: CourseSummary[] }>(`/courses?category=${catRow.slug}&limit=10`).then((r) => setCatRowCourses(r.results)).catch(() => undefined);
  }, [catRow]);
  useEffect(() => {
    if (!instructorRow) return;
    get<{ results: CourseSummary[] }>(`/courses?lecturer=${instructorRow.slug}&limit=10`).then((r) => setInstructorRowCourses(r.results)).catch(() => undefined);
  }, [instructorRow]);

  useEffect(() => {
    get<HomeData>("/home")
      .then(setHome)
      .catch(() => setError(true));
  }, []);

  // Signed-in users get real progress numbers in "Your Next Course"
  useEffect(() => {
    if (user) get<LibraryData>("/me/learning").then(setLibrary).catch(() => undefined);
  }, [user]);

  if (error) {
    return (
      <main className="page">
        <MobileHeader />
        <div className="dark-panel" style={{ padding: 40, textAlign: "center" }}>
          <h3>Can&apos;t reach the API</h3>
          <p className="muted">Start the backend with `npm run dev:api` (it serves on http://localhost:4000).</p>
        </div>
      </main>
    );
  }

  if (!home) {
    return (
      <main className="page">
        <MobileHeader />
        <div className="dark-panel" style={{ padding: 40, textAlign: "center" }}>
          <p className="muted">Loading…</p>
        </div>
      </main>
    );
  }

  const featured = home.latest[0] ?? home.trending[0] ?? home.topRated[0];
  const trendSource =
    trendTab === "day" ? home.trending : trendTab === "week" ? home.topRated : home.latest;

  const downloaded = library?.counts?.downloaded ?? 0;
  const saved = library?.counts?.saved ?? 0;
  const marked = downloaded + saved;

  return (
    <main className="page">
      <MobileHeader />

      {/* Featured hero */}
      {featured && (
        <div className="hero">
          <div className="hero-content">
            <span className="eyebrow">Featured course · build week</span>
            <h1 className="display">Make fast feel<br />intentional.</h1>
            <p>{featured.description || "A hands-on course for engineers who care about the details users can feel."}</p>
            <div className="detail-meta">
              {/* The hero prints the biggest version of every one of these, so an
                  unrated course claiming 0.0 and a Telegram course claiming no
                  runtime and no lessons are all suppressed rather than shown as
                  zeroes. */}
              {featured.ratingCount > 0 && (
                <span><Star size={13} fill="currentColor" className="rating" /> {featured.ratingAvg.toFixed(1)}</span>
              )}
              {featured.durationMin > 0 && <span>{formatDuration(featured.durationMin)}</span>}
              {featured.lessonCount > 0 && <span>{featured.lessonCount} lessons</span>}
              <span>{featured.level}</span>
            </div>
            <div className="actions">
              <Link href={`/courses/${featured.slug}`} className="btn primary">
                <Play size={14} fill="currentColor" style={{ display: "inline", verticalAlign: "middle" }} /> Start learning
              </Link>
              <Link href={`/courses/${featured.slug}`} className="btn">View course</Link>
            </div>
          </div>
        </div>
      )}

      {/* Trending — ranked, with Day/Week/Month tabs */}
      <section className="rail">
        <div className="section-head">
          <h2>Trending</h2>
          <div className="pills">
            {(["day", "week", "month"] as const).map((p) => (
              <button
                key={p}
                className={`badge ${trendTab === p ? "primary" : ""}`}
                onClick={() => setTrendTab(p)}
              >
                {p === "day" ? "Day" : p === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
          <Link href="/browse?sort=top-rated">See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
        </div>
        <div className="rail-row">
          {trendSource.slice(0, 10).map((c, i) => (
            <CourseCard key={c.id} course={c} rank={i + 1} />
          ))}
        </div>
      </section>

      {/* Latest added */}
      <section className="rail">
        <div className="section-head">
          <h2>Latest added</h2>
          <Link href="/browse?sort=newest">See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
        </div>
        <div className="rail-row">
          {home.latest.slice(0, 10).map((c) => (
            <CourseCard key={c.id} course={{ ...c, isNew: true }} />
          ))}
        </div>
      </section>

      {/* Cheat-sheets, roadmaps and notes — the library beside the catalogue.
          Placed after the newest courses because it is a change of gear: short
          reads rather than something to sit down with. */}
      <HomeResources />

      {/* Your next course — personalized nudge */}
      {!user ? (
        <section className="rail dark-panel recommend">
          <div>
            <span className="eyebrow">Your next course</span>
            <h3 style={{ margin: "7px 0 0" }}>Recommendations made for your pace.</h3>
            <p>Sign in, then learn and rate what you love. Syncourse learns the topics and lecturers you gravitate toward, then keeps a fresh set of picks ready.</p>
          </div>
          <Link href="/auth" className="btn primary">
            Sign in <ArrowRight size={13} style={{ display: "inline", verticalAlign: "middle" }} />
          </Link>
        </section>
      ) : (
        <section className="rail dark-panel recommend">
          <div>
            <span className="eyebrow">Your next course</span>
            <h3 style={{ margin: "7px 0 0" }}>Pick up where you left off.</h3>
            <p>Rate what you learn and Syncourse keeps your next picks fresh.</p>
            <div style={{ marginTop: 16, maxWidth: 360 }}>
              <ProgressRow label="Downloaded" value={downloaded} total={marked} />
              <div style={{ height: 10 }} />
              <ProgressRow label="Saved for later" value={saved} total={marked} />
            </div>
          </div>
          <Link href="/my-learning" className="btn primary">
            Open your library <ArrowRight size={13} style={{ display: "inline", verticalAlign: "middle" }} />
          </Link>
        </section>
      )}

      {/* Top rated */}
      <section className="rail">
        <div className="section-head">
          <h2>Top rated</h2>
          <Link href="/browse?sort=top-rated">See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
        </div>
        <div className="rail-row">
          {home.topRated.slice(0, 10).map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      </section>

      {/* Explore by Category — dropdown row */}
      {catRow && catRowCourses.length > 0 && (
        <section className="rail">
          <div className="section-head">
            <h2>Explore by Category</h2>
            <select
              value={catRow.slug}
              onChange={(e) => setCatRowSlug(e.target.value)}
              className="badge"
              style={{ cursor: "pointer", outline: "none" }}
            >
              {home.categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
            <Link href={`/browse?category=${catRow.slug}`}>See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
          </div>
          <div className="rail-row">
            {catRowCourses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </section>
      )}

      {/* By Instructor — dropdown row */}
      {instructorRow && instructorRowCourses.length > 0 && (
        <section className="rail">
          <div className="section-head">
            <h2>By Instructor</h2>
            <select
              value={instructorRow.slug}
              onChange={(e) => setInstructorRowSlug(e.target.value)}
              className="badge"
              style={{ cursor: "pointer", outline: "none" }}
            >
              {home.lecturers.map((l) => (
                <option key={l.slug} value={l.slug}>{l.name}</option>
              ))}
            </select>
            <Link href={`/lecturers/${instructorRow.slug}`}>See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
          </div>
          <div className="rail-row">
            {instructorRowCourses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </section>
      )}

      {/* Best of — one row, dropdown to switch organization */}
      {activeOrg && activeOrg.courses.length > 0 && (
        <section className="rail">
          <div className="section-head">
            <h2>Best of</h2>
            <select
              value={activeOrg.id}
              onChange={(e) => setBestOfOrgId(e.target.value)}
              className="badge"
              style={{ cursor: "pointer", outline: "none" }}
            >
              {home.bestOf
                .filter((o) => o.courses.length > 0)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
            <Link href={`/organizations/${activeOrg.slug}`}>See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
          </div>
          <div className="rail-row">
            {activeOrg.courses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </section>
      )}

      {/* Featured learning paths — franchise-style cards with a thumbnail strip */}
      {home.featuredPaths.length > 0 && (
        <section className="rail">
          <div className="section-head">
            <h2>Featured learning paths</h2>
            <Link href="/paths">See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
          </div>
          <div className="rail-row">
            {home.featuredPaths.map((p) => (
              <Link key={p.id} href={`/paths/${p.id}`} className="dark-panel path-card">
                <span className="eyebrow">Learning path</span>
                <h3 style={{ margin: "14px 0 8px", fontSize: 17 }}>{p.title}</h3>
                {p.description && <p className="muted" style={{ margin: 0, fontSize: 11 }}>{p.description}</p>}
                {/* thumbnail strip — like PhonoFilm's franchise cards */}
                {p.courses.length > 0 && (
                  <div className="path-card__strip">
                    {p.courses.slice(0, 4).map((c) => (
                      <div key={c.id} className="cover" style={{ aspectRatio: "0.8", borderRadius: 8, margin: 0 }}>
                        {c.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.thumbnailUrl} alt={c.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" style={{ zIndex: 0 }} />
                        ) : (
                          <span className="cover-mark" style={{ fontSize: 16 }}>🎓</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="muted" style={{ margin: "12px 0 0", fontSize: 11 }}>
                  {p.courseCount} courses
                  {p.totalVotes > 0 && ` · ★ ${p.ratingAvg.toFixed(1)} avg · ${p.totalVotes.toLocaleString()} votes`}
                </p>
                <div className="path-card__bar"><i style={{ width: "38%" }} /></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Community shelves — self-fetching, and absent unless someone has built one */}
      <HomeCollections />

      {/* Explore by category */}
      {home.categories.length > 0 && (
        <section className="rail">
          <div className="section-head">
            <h2>Explore by category</h2>
          </div>
          <div className="category-grid">
            {home.categories.map((c) => (
              <Link href={`/browse?category=${c.slug}`} className="category-tile" key={c.id}>
                <strong>{c.icon} {c.name}</strong>
                <span>{c.courseCount} courses <ChevronRight size={12} style={{ float: "right" }} /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Lecturers + Channels */}
      <section className="rail">
        <div className="section-head">
          <h2>Lecturers</h2>
          <Link href="/lecturers">See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
        </div>
        <div className="rail-row">
          {home.lecturers.map((l) => (
            <LecturerCard key={l.id} lecturer={l} />
          ))}
        </div>
      </section>

      <section className="rail">
        <div className="section-head">
          <h2>Channels &amp; Schools</h2>
          <Link href="/organizations">See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
        </div>
        <div className="rail-row">
          {home.organizations.map((o) => (
            <PublisherCard key={o.id} org={o} />
          ))}
        </div>
      </section>

      {/* Load More */}
      <div style={{ marginTop: 42, display: "flex", justifyContent: "center" }}>
        <Link href="/browse" className="btn" style={{ display: "inline-flex", alignItems: "center", padding: "12px 28px" }}>
          Load More
        </Link>
      </div>
    </main>
  );
}

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span>{value}{total > 0 ? `/${total}` : ""}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
