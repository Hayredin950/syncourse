"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Play, Star } from "lucide-react";
import { get } from "@/lib/api";
import type { CourseSummary, HomeData, LearningData } from "@/lib/types";
import { CourseCard } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";
import { useAuth } from "@/lib/auth";
import { formatDuration } from "@/lib/format";

export default function HomePage() {
  const [home, setHome] = useState<HomeData | null>(null);
  const [learning, setLearning] = useState<LearningData | null>(null);
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
    if (user) get<LearningData>("/learning").then(setLearning).catch(() => undefined);
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

  const inProgress = learning?.counts?.inProgress ?? 0;
  const completed = learning?.counts?.completed ?? 0;
  const totalEnrolled = inProgress + completed;

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
              <span><Star size={13} fill="currentColor" className="rating" /> {featured.ratingAvg.toFixed(1)}</span>
              <span>{formatDuration(featured.durationMin)}</span>
              <span>{featured.lessonCount} lessons</span>
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
            <h3 style={{ margin: "7px 0 0" }}>You&apos;re almost there — continue where you left off.</h3>
            <p>Rate what you learn and Syncourse keeps your next picks fresh.</p>
            <div style={{ marginTop: 16, maxWidth: 360 }}>
              <ProgressRow label="In progress" value={inProgress} total={totalEnrolled} />
              <div style={{ height: 10 }} />
              <ProgressRow label="Completed" value={completed} total={totalEnrolled} />
            </div>
          </div>
          <Link href="/my-learning" className="btn primary">
            Continue learning <ArrowRight size={13} style={{ display: "inline", verticalAlign: "middle" }} />
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
            <Link href="/browse">See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
          </div>
          <div className="rail-row" style={{ gridAutoColumns: "minmax(260px, 1fr)" }}>
            {home.featuredPaths.map((p) => (
              <Link
                key={p.id}
                href="/browse"
                className="dark-panel"
                style={{ padding: 18, background: "linear-gradient(135deg, hsl(196 40% 24%), #12100e 70%)", display: "block" }}
              >
                <span className="eyebrow">Learning path</span>
                <h3 style={{ margin: "14px 0 8px", fontSize: 17 }}>{p.title}</h3>
                {p.description && <p className="muted" style={{ margin: 0, fontSize: 11 }}>{p.description}</p>}
                {/* thumbnail strip — like PhonoFilm's franchise cards */}
                {p.courses.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 14 }}>
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
                  {p.courseCount} courses · ★ {p.ratingAvg.toFixed(1)} avg · {p.totalVotes.toLocaleString()} votes
                </p>
                <div style={{ marginTop: 14, height: 3, background: "rgba(255,255,255,.16)" }}>
                  <div style={{ width: "38%", height: "100%", background: "hsl(var(--primary))" }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

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
          <Link href="/browse">See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
        </div>
        <div className="rail-row">
          {home.lecturers.map((l) => (
            <Link key={l.id} href={`/lecturers/${l.slug}`} className="dark-panel" style={{ padding: 14, display: "block", minWidth: 150 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="avatar" style={{ width: 40, height: 40, fontSize: 16, borderRadius: 12 }}>
                  {l.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.photoUrl} alt="" className="h-full w-full rounded-xl object-cover" />
                  ) : (
                    l.name.charAt(0)
                  )}
                </span>
                <div>
                  <strong style={{ fontSize: 12 }}>{l.name}</strong>
                  <div className="muted" style={{ fontSize: 10 }}>{l.courseCount} courses</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rail">
        <div className="section-head">
          <h2>Channels &amp; Schools</h2>
          <Link href="/browse">See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
        </div>
        <div className="rail-row">
          {home.organizations.map((o) => (
            <Link key={o.id} href={`/organizations/${o.slug}`} className="dark-panel" style={{ padding: 14, display: "block", minWidth: 170 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="avatar" style={{ width: 40, height: 40, fontSize: 16, borderRadius: 12 }}>
                  {o.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.logoUrl} alt="" className="h-full w-full rounded-xl object-cover" />
                  ) : (
                    o.name.charAt(0)
                  )}
                </span>
                <div>
                  <strong style={{ fontSize: 12 }}>{o.name}</strong>
                  <div className="muted" style={{ fontSize: 10 }}>
                    {o.subscribers.toLocaleString()} subscribers · {o.courseCount} courses
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Load More */}
      <div style={{ marginTop: 42 }}>
        <Link href="/browse" className="btn" style={{ display: "block", textAlign: "center", padding: "13px" }}>
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
