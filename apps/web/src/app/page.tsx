"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Play,
  Star,
  Zap,
} from "lucide-react";
import { get } from "@/lib/api";
import type { CourseSummary, HomeData, LibraryData } from "@/lib/types";
import { CourseCard } from "@/components/CourseCard";
import { CoverImage } from "@/components/CoverImage";
import { LecturerCard, PublisherCard } from "@/components/EntityCard";
import { HomeCollections } from "@/components/HomeCollections";
import { HomeResources } from "@/components/HomeResources";
import { MobileHeader } from "@/components/Nav";
import { Rail } from "@/components/Rail";
import { Menu } from "@/components/Menu";
import { SearchableMenu } from "@/components/SearchableMenu";
import { Sk, SkCard } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth";
import { formatDuration, plural } from "@/lib/format";
import { cloudinaryUrl } from "@/lib/cloudinary";

export default function HomePage() {
  const [home, setHome] = useState<HomeData | null>(null);
  const [library, setLibrary] = useState<LibraryData | null>(null);
  const [forYou, setForYou] = useState<{ source: string; courses: CourseSummary[] } | null>(null);
  const [error, setError] = useState(false);
  const { user } = useAuth();

  const [trendTab, setTrendTab] = useState<"popular" | "top" | "newest">("popular");

  // The home payload carries the twelve lecturers whose names sort first — a
  // useful rail, but not a complete picker. The instructor dropdown asks the
  // catalogue for every lecturer instead, so a name that sorts late (Mosh
  // Hamedani, say) is still selectable.
  const [allLecturers, setAllLecturers] = useState<HomeData["lecturers"] | null>(null);

  // "Best of" — one row with a dropdown to switch organizations
  const [bestOfOrgId, setBestOfOrgId] = useState("");

  const categoriesByCount = useMemo(
    () => (home ? [...home.categories].sort((a, b) => b.courseCount - a.courseCount) : []),
    [home],
  );
  const lecturersByCount = useMemo(() => {
    const rows = allLecturers ?? home?.lecturers ?? [];
    const withCourses = rows.filter((l) => l.courseCount > 0);
    return [...(withCourses.length > 0 ? withCourses : rows)].sort((a, b) => b.courseCount - a.courseCount);
  }, [home, allLecturers]);
  const bestOfByCount = useMemo(
    () =>
      home
        ? home.bestOf.filter((o) => o.courses.length > 0).sort((a, b) => b.courses.length - a.courses.length)
        : [],
    [home],
  );

  useEffect(() => {
    if (bestOfOrgId || bestOfByCount.length === 0) return;
    setBestOfOrgId(bestOfByCount[0].id);
  }, [bestOfByCount, bestOfOrgId]);
  const activeOrg = bestOfByCount.find((o) => o.id === bestOfOrgId) ?? bestOfByCount[0];

  // Curated rows with dropdowns (PhonoFilm: Movie Genre → / Directors →)
  const [catRowSlug, setCatRowSlug] = useState("");
  const [instructorRowSlug, setInstructorRowSlug] = useState("");
  const [catRowCourses, setCatRowCourses] = useState<CourseSummary[]>([]);
  const [instructorRowCourses, setInstructorRowCourses] = useState<CourseSummary[]>([]);
  const catRow = categoriesByCount.find((c) => c.slug === catRowSlug) ?? categoriesByCount[0];
  const instructorRow = lecturersByCount.find((l) => l.slug === instructorRowSlug) ?? lecturersByCount[0];
  useEffect(() => {
    if (!catRow) return;
    get<{ results: CourseSummary[] }>(`/courses?category=${catRow.slug}&limit=12`)
      .then((r) => setCatRowCourses(r.results))
      .catch(() => undefined);
  }, [catRow]);
  useEffect(() => {
    if (!instructorRow) return;
    get<{ results: CourseSummary[] }>(`/courses?lecturer=${instructorRow.slug}&limit=12`)
      .then((r) => setInstructorRowCourses(r.results))
      .catch(() => undefined);
  }, [instructorRow]);

  useEffect(() => {
    get<HomeData>("/home")
      .then(setHome)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    get<HomeData["lecturers"]>("/lecturers")
      .then(setAllLecturers)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (user) get<LibraryData>("/me/learning").then(setLibrary).catch(() => undefined);
  }, [user]);

  // The same taste profile the course pages use, surfaced where a reader
  // actually starts their session. Anonymous visitors get nothing here: the
  // endpoint would just return popularity, which the rails below already show.
  useEffect(() => {
    if (!user) {
      setForYou(null);
      return;
    }
    get<{ source: string; courses: CourseSummary[] }>("/recommendations/for-you?limit=12")
      .then((r) => setForYou(r.courses.length > 0 ? r : null))
      .catch(() => setForYou(null));
  }, [user]);

  /**
   * The hero is a carousel of the week's headline titles, deduped across the
   * three rails so the same course cannot appear twice as you page through.
   */
  const featuredList = useMemo(() => {
    if (!home) return [] as CourseSummary[];
    const seen = new Set<string>();
    const out: CourseSummary[] = [];
    for (const c of [...home.trending.slice(0, 4), ...home.topRated.slice(0, 3), ...home.latest.slice(0, 3)]) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    }
    return out.slice(0, 6);
  }, [home]);
  const [slide, setSlide] = useState(0);
  const featured = featuredList[slide] ?? featuredList[0];

  useEffect(() => {
    if (featuredList.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % featuredList.length), 8000);
    return () => clearInterval(t);
  }, [featuredList.length]);

  if (error) {
    return (
      <main className="page">
        <MobileHeader />
        <div className="empty-state" style={{ padding: "54px 26px", marginTop: 20 }}>
          <div className="empty-icon">📡</div>
          <h3>We couldn&apos;t load the catalogue</h3>
          <p style={{ margin: "0 auto", maxWidth: "44ch" }}>
            The connection dropped on the way to our servers. Your courses are still there.
          </p>
          <button className="btn primary" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!home) {
    return (
      <main className="page">
        <MobileHeader />
        <div role="status" aria-busy="true">
          <span className="sk-label">Loading the catalogue…</span>
          <Sk className="sk-hero" style={{ minHeight: 440, borderRadius: 22, marginTop: 12 }} />
          {[0, 1].map((i) => (
            <div key={i} style={{ marginTop: 42 }}>
              <Sk className="sk-line sk-line--lg" style={{ width: 168, marginBottom: 16 }} />
              <div className="rail-row">
                {Array.from({ length: 7 }, (_, j) => (
                  <SkCard key={j} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  const trendSource =
    trendTab === "popular" ? home.trending : trendTab === "top" ? home.topRated : home.latest;

  const downloaded = library?.counts?.downloaded ?? 0;
  const saved = library?.counts?.saved ?? 0;
  const marked = downloaded + saved;

  return (
    <main className="page">
      <MobileHeader />

      {/* phone-only category strip (the desktop one lives inside the top bar) */}
      <div className="mobile-cats no-scrollbar" aria-label="Catalogue types">
        <Link href="/browse" className="nav-cat active">
          <BookOpen size={16} /> All
        </Link>
        <Link href="/browse?type=course" className="nav-cat">
          Courses
        </Link>
        <Link href="/browse?type=mini-course" className="nav-cat">
          <Zap size={16} /> Mini
        </Link>
        <Link href="/resources" className="nav-cat">
          Resources
        </Link>
        <Link href="/lists" className="nav-cat">
          Collections
        </Link>
      </div>

      {/* Featured hero carousel */}
      {featured && (
        <div
          className="hero"
          style={
            featured.thumbnailUrl
              ? { backgroundImage: `linear-gradient(rgba(14,14,13,.35), rgba(14,14,13,.55)), url("${cloudinaryUrl(featured.thumbnailUrl, { width: 1200 })}")` }
              : undefined
          }
        >
          <span className="hero-blur" aria-hidden />
          <Link href={`/courses/${featured.slug}`} className="hero-art" aria-label={featured.title}>
            <CoverImage
              src={featured.thumbnailUrl}
              transform={{ width: 1600 }}
              alt=""
              eager
              className="h-full w-full object-cover"
            />
          </Link>
          <div className="hero-shade" />
          <div className="hero-content">
            <span className="hero-rank">#{slide + 1} today</span>
            <h1>{featured.title}</h1>
            <div className="detail-meta">
              {featured.ratingCount > 0 && (
                <span className="rating">
                  <Star size={14} fill="currentColor" /> {featured.ratingAvg.toFixed(1)}
                </span>
              )}
              <span>{featured.level}</span>
              {featured.durationMin > 0 && <span>{formatDuration(featured.durationMin)}</span>}
              {featured.lessonCount > 0 && <span>{featured.lessonCount} lessons</span>}
              {featured.categoryNames?.[0] && <span>{featured.categoryNames[0]}</span>}
            </div>
            <p>{featured.description || "A hands-on course for engineers who care about the details users can feel."}</p>
            <div className="actions">
              <Link href={`/courses/${featured.slug}`} className="hero-cta">
                <Play size={19} fill="currentColor" /> <span>Start learning</span>
              </Link>
              <Link href={`/courses/${featured.slug}?download=1`} className="hero-dl">
                <Download size={19} /> Download
              </Link>
            </div>
          </div>
          {featuredList.length > 1 && (
            <>
              <button
                type="button"
                className="hero-nav hero-nav--prev"
                aria-label="Previous featured course"
                onClick={() => setSlide((s) => (s - 1 + featuredList.length) % featuredList.length)}
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                className="hero-nav hero-nav--next"
                aria-label="Next featured course"
                onClick={() => setSlide((s) => (s + 1) % featuredList.length)}
              >
                <ChevronRight size={22} />
              </button>
              <div className="hero-dots">
                {featuredList.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`hero-dot ${i === slide ? "active" : ""}`}
                    aria-label={`Featured ${i + 1}`}
                    onClick={() => setSlide(i)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* For you — the reader's own shelf, from the same explainable profile the
          "More like this" rail uses. It leads the page when there is one. */}
      {user && forYou && (
        <Rail
          title="For you"
          href="/recommendations"
          subtitle={
            forYou.source === "personalised"
              ? "Picked from what you have saved, downloaded and rated."
              : "Popular right now — save or rate a course and this grows sharper."
          }
        >
          {forYou.courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </Rail>
      )}

      {/* New drops */}
      <Rail
        title="New drops"
        subtitle="New courses and fresh lessons, newest first."
        href="/browse?sort=newest"
      >
        {home.latest.slice(0, 12).map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </Rail>

      {/* Trending — ranked, with Popular / Top rated / Newest tabs */}
      <Rail
        title="The courses everyone's watching this week"
        href="/browse?sort=top-rated"
        right={
          <div className="tabs" role="tablist" aria-label="Sort trending">
            {(["popular", "top", "newest"] as const).map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={trendTab === p}
                className={`tab ${trendTab === p ? "active" : ""}`}
                onClick={() => setTrendTab(p)}
              >
                {p === "popular" ? "Popular" : p === "top" ? "Top rated" : "Newest"}
              </button>
            ))}
          </div>
        }
      >
        {trendSource.slice(0, 12).map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </Rail>

      {/* Top 10 — the signed rank numerals */}
      <Rail
        title="Top 10 on Syncourse today"
        subtitle="What everyone is learning right now."
        href="/browse?sort=top-rated"
        rank
      >
        {home.topRated.slice(0, 10).map((c, i) => (
          <div key={c.id} className="rank-card">
            <span className="rank-num" aria-hidden="true">
              {i + 1}
            </span>
            <CourseCard course={c} />
          </div>
        ))}
      </Rail>

      {/* Editors' picks — landscape, like phono's acclaimed row */}
      {home.topRated.length > 3 && (
        <Rail title="Our editors' most acclaimed" subtitle="Hand-picked, highest rated first." href="/browse?sort=top-rated">
          {home.topRated.slice(0, 8).map((c) => (
            <Link key={c.id} href={`/courses/${c.slug}`} className="wide-card">
              <span className="wide-card__art">
                <CoverImage src={c.thumbnailUrl} transform={{ width: 640, height: 360 }} alt="" />
                <span className="wide-card__shade" />
                <span className="wide-card__title">{c.title}</span>
              </span>
              <span className="card-meta">
                {c.ratingCount > 0 && (
                  <span className="rating">
                    <Star size={12} fill="currentColor" /> {c.ratingAvg.toFixed(1)}
                  </span>
                )}
                {c.durationMin > 0 && <span>{formatDuration(c.durationMin)}</span>}
                {c.lessonCount > 0 && <span>{c.lessonCount} lessons</span>}
              </span>
            </Link>
          ))}
        </Rail>
      )}

      {/* Explore by Category — dropdown row */}
      {catRow && catRowCourses.length > 0 && (
        <Rail
          title="Explore by category"
          href={`/browse?category=${catRow.slug}`}
          right={
            <Menu
              value={catRow.slug}
              onChange={setCatRowSlug}
              label="Category"
              align="right"
              options={categoriesByCount.map((c) => ({ value: c.slug, label: c.name }))}
            />
          }
        >
          {catRowCourses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </Rail>
      )}

      {/* By Instructor — dropdown row */}
      {instructorRow && instructorRowCourses.length > 0 && (
        <Rail
          title="By instructor"
          href={`/lecturers/${instructorRow.slug}`}
          right={
            <SearchableMenu
              value={instructorRow.slug}
              onChange={setInstructorRowSlug}
              label="Instructor"
              placeholder="Search instructors…"
              align="right"
              options={lecturersByCount.map((l) => ({
                value: l.slug,
                label: l.name,
                meta: plural(l.courseCount, "course"),
              }))}
            />
          }
        >
          {instructorRowCourses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </Rail>
      )}

      {/* Best of — one row, dropdown to switch organization */}
      {activeOrg && activeOrg.courses.length > 0 && (
        <Rail
          title="Best of"
          href={`/organizations/${activeOrg.slug}`}
          right={
            <Menu
              value={activeOrg.id}
              onChange={setBestOfOrgId}
              label="Publisher"
              align="right"
              options={bestOfByCount.map((o) => ({ value: o.id, label: o.name }))}
            />
          }
        >
          {activeOrg.courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </Rail>
      )}

      {/* Cheat-sheets, roadmaps and notes — the library beside the catalogue. */}
      <HomeResources />

      {/* Your next course — personalized nudge */}
      {!user ? (
        <section className="rail dark-panel recommend">
          <div>
            <span className="eyebrow">Your next course</span>
            <h3 style={{ margin: "8px 0 0", fontSize: 20 }}>Recommendations made for your pace.</h3>
            <p className="muted" style={{ margin: "6px 0 0", maxWidth: "58ch" }}>
              Sign in, then learn and rate what you love. Syncourse learns the topics and lecturers you
              gravitate toward, then keeps a fresh set of picks ready.
            </p>
          </div>
          <Link href="/auth" className="btn primary">
            Sign in <ArrowRight size={14} />
          </Link>
        </section>
      ) : (
        <section className="rail dark-panel recommend">
          <div>
            <span className="eyebrow">Your next course</span>
            <h3 style={{ margin: "8px 0 0", fontSize: 20 }}>Pick up where you left off.</h3>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Rate what you learn and Syncourse keeps your next picks fresh.
            </p>
            <div style={{ marginTop: 16, maxWidth: 360 }}>
              <ProgressRow label="Downloaded" value={downloaded} total={marked} />
              <div style={{ height: 10 }} />
              <ProgressRow label="Saved for later" value={saved} total={marked} />
            </div>
          </div>
          <Link href="/my-learning" className="btn primary">
            Open your library <ArrowRight size={14} />
          </Link>
        </section>
      )}

      {/* Top rated */}
      <Rail title="Top rated" href="/browse?sort=top-rated">
        {home.topRated.slice(0, 12).map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </Rail>

      {/* Featured learning paths — franchise-style cards with a thumbnail strip */}
      {home.featuredPaths.length > 0 && (
        <Rail title="Featured learning paths" subtitle="Follow a route from first lesson to last." href="/paths">
          {home.featuredPaths.map((p) => (
            <Link key={p.id} href={`/paths/${p.id}`} className="path-card">
              <span className="path-card__strip">
                {(p.courses.length > 0 ? p.courses.slice(0, 4) : []).map((c) => (
                  <span key={c.id} className="path-card__thumb">
                    <CoverImage src={c.thumbnailUrl} transform={{ width: 200, height: 230 }} alt="" />
                  </span>
                ))}
                {p.courses.length === 0 && <span className="path-card__thumb path-card__thumb--empty" />}
              </span>
              <span className="path-card__title">{p.title}</span>
              {p.description && <span className="path-card__desc">{p.description}</span>}
              <span className="path-card__meta">
                {p.courseCount} courses
                {p.totalVotes > 0 && ` · ★ ${p.ratingAvg.toFixed(1)} avg · ${p.totalVotes.toLocaleString()} votes`}
              </span>
            </Link>
          ))}
        </Rail>
      )}

      {/* Community shelves — self-fetching, and absent unless someone has built one */}
      <HomeCollections />

      {/* The complete directory, as against the curated "Explore by category" rail. */}
      {home.categories.length > 0 && (
        <>
          <p className="section-label">Browse all categories</p>
          <div className="category-grid">
            {home.categories.map((c) => (
              <Link href={`/browse?category=${c.slug}`} className="category-tile" key={c.id}>
                <strong>
                  {c.icon} {c.name}
                </strong>
                <span>
                  {c.courseCount} courses <ChevronRight size={12} style={{ float: "right" }} />
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Lecturers + Channels */}
      <Rail title="Lecturers" href="/lecturers">
        {home.lecturers.map((l) => (
          <LecturerCard key={l.id} lecturer={l} />
        ))}
      </Rail>

      <Rail title="Channels & schools" href="/organizations">
        {home.organizations.map((o) => (
          <PublisherCard key={o.id} org={o} />
        ))}
      </Rail>

      <div style={{ marginTop: 48, display: "flex", justifyContent: "center" }}>
        <Link href="/browse" className="btn ghost" style={{ minHeight: 48, padding: "0 32px" }}>
          Browse all courses
        </Link>
      </div>
    </main>
  );
}

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#b8afa4" }}>
        <span>{label}</span>
        <span>
          {value}
          {total > 0 ? `/${total}` : ""}
        </span>
      </div>
      <div style={{ marginTop: 5, height: 6, borderRadius: 999, background: "#2a2723", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 999, background: "#e8a13a", width: `${pct}%` }} />
      </div>
    </div>
  );
}
