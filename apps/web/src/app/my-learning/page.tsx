"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Heart, LayoutGrid, List, Search, Star } from "lucide-react";
import { get } from "@/lib/api";
import type { LibraryData, LibraryCourse } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { MobileHeader } from "@/components/Nav";
import { SkRows } from "@/components/Skeleton";
import { LoadError } from "@/components/LoadError";
import { CoverImage } from "@/components/CoverImage";
import { hueFromString } from "@/components/CourseCard";

/**
 * A reader's library: downloaded, saved, liked.
 *
 * There is no "in progress" or "completed" here. Courses are delivered whole as
 * Telegram archives, so there is no lesson-by-lesson position to report — the
 * honest facts are which courses you took and which you marked.
 *
 * The route keeps its /my-learning path so existing links and bookmarks still
 * resolve; only the label changed.
 *
 * `?tab=` is read on load so a tab can be linked to — /me's Saved and Liked
 * cards point here, and both used to land on /search?scope=…, which /search has
 * never read.
 *
 * A library is a shelf, not a feed: once it passes a dozen courses the only
 * useful question is "which one was that", so the page carries the same
 * search + level filter + grid/list toggle as /browse. Filtering happens here
 * because every row is already in `data` — a round trip per keystroke would buy
 * nothing and lose the instant answer.
 */
type Tab = "downloaded" | "saved" | "liked";

const TABS: Tab[] = ["downloaded", "saved", "liked"];

const EMPTY: Record<Tab, { title: string; body: string }> = {
  downloaded: {
    title: "No downloads yet",
    body: "Courses you download through the Telegram bot show up here.",
  },
  saved: { title: "Nothing saved", body: "Tap the bookmark on a course to keep it here." },
  liked: { title: "Nothing liked", body: "Courses you like show up here." },
};

const STAMP: Record<Tab, string> = {
  downloaded: "Downloaded",
  saved: "Saved",
  liked: "Liked",
};

export default function MyLibraryPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <MobileHeader title="My Library" />
          <SkRows n={6} label="Loading your library" />
        </main>
      }
    >
      <MyLibrary />
    </Suspense>
  );
}

/** The poster card used by the grid — the same shelf /browse and the rails use. */
function LibraryCard({ course, tab }: { course: LibraryCourse; tab: Tab }) {
  const hue = hueFromString(course.slug || course.id);
  const when = course.downloadedAt ?? course.savedAt ?? course.likedAt ?? null;
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="course-card"
      data-testid={`library-course-${course.slug}`}
    >
      <div className="cover-wrap">
        <div
          className="cover"
          style={
            {
              "--cover-a": `hsl(${hue} 42% 18%)`,
              "--cover-b": `hsl(${(hue + 55) % 360} 50% 9%)`,
            } as React.CSSProperties
          }
        >
          <span className="cover__ph" aria-hidden>
            🎓
          </span>
          <CoverImage
            src={course.thumbnailUrl}
            transform={{ width: 280, height: 420 }}
            alt={course.title}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ zIndex: 0 }}
          />
          <span className="poster-mark" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="12" cy="12" r="9" />
              <circle cx="13.5" cy="13.5" r="3.2" />
            </svg>
          </span>
        </div>
      </div>
      <span className="card-title">{course.title}</span>
      <div className="card-meta">
        {course.ratingCount > 0 && (
          <span className="rating">
            <Star size={11} fill="currentColor" /> {course.ratingAvg.toFixed(1)}
          </span>
        )}
        <span>{course.level}</span>
      </div>
      {when && (
        <span className="card-added">
          {STAMP[tab]}{" "}
          {new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}
    </Link>
  );
}

/** The list view — one row per course, with its cover, facts and the date. */
function LibraryRow({ course, tab }: { course: LibraryCourse; tab: Tab }) {
  const when = course.downloadedAt ?? course.savedAt ?? course.likedAt ?? null;
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="lesson"
      data-testid={`library-course-${course.slug}`}
    >
      <span className="lesson__thumb">
        <CoverImage
          src={course.thumbnailUrl}
          transform={{ width: 172, height: 108 }}
          alt={course.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </span>
      <span className="lesson__main">
        <span className="lesson__title">{course.title}</span>
        <span className="lesson__sub">
          {course.ratingCount > 0 ? `${course.ratingAvg.toFixed(1)} · ` : ""}
          {course.level}
        </span>
      </span>
      {when && (
        <span className="muted mono" style={{ fontSize: 9, flex: "none" }}>
          {new Date(when).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      )}
    </Link>
  );
}

function MyLibrary() {
  const { token, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<LibraryData | null>(null);
  /* `.catch(() => {})` left `data` null, and null is the skeleton branch — so a
     dropped request shimmered here until the reader gave up and reloaded. */
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>(() => {
    const wanted = params.get("tab");
    return TABS.includes(wanted as Tab) ? (wanted as Tab) : "downloaded";
  });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");

  const load = useCallback(() => {
    setFailed(false);
    get<LibraryData>("/me/learning")
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!token) {
      router.push("/auth?next=/my-learning");
      return;
    }
    load();
  }, [loading, token, router, load]);

  const rows = data?.[tab] ?? [];
  const levels = useMemo(
    () => Array.from(new Set(rows.map((c) => c.level).filter(Boolean))),
    [rows],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((c) => {
      if (level !== "all" && c.level !== level) return false;
      if (!needle) return true;
      return (
        c.title.toLowerCase().includes(needle) ||
        (c.description ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, query, level]);

  const filtersOn = query.trim() !== "" || level !== "all";
  const clearFilters = () => {
    setQuery("");
    setLevel("all");
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    /* A level that exists in Saved may not exist in Downloaded; carrying it
       over would open the new tab on an empty screen for no visible reason. */
    clearFilters();
  };

  if (!token) return null;
  if (!data)
    return (
      <main className="page">
        <MobileHeader title="My Library" />
        <span className="eyebrow">Your library</span>
        <h1 className="display page-title">My Library</h1>
        <div style={{ marginTop: 18 }}>
          {failed ? (
            <LoadError title="We couldn't load your library" onRetry={load} />
          ) : (
            <SkRows n={6} label="Loading your library" />
          )}
        </div>
      </main>
    );

  return (
    <main className="page">
      <MobileHeader title="My Library" />
      <span className="eyebrow">Your library</span>
      <h1 className="display page-title">My Library</h1>

      <div className="pills" style={{ marginTop: 18 }}>
        {(
          [
            ["downloaded", `Downloaded ${data.counts.downloaded}`],
            ["saved", `Saved ${data.counts.saved}`],
            ["liked", `Liked ${data.counts.liked}`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            className={`badge ${tab === t ? "primary" : ""}`}
            onClick={() => switchTab(t)}
            aria-pressed={tab === t}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length > 0 && (
        <>
          <div className="filters" style={{ marginTop: 14 }}>
            <input
              className="filter-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your library"
              aria-label="Search your library"
            />
            <div className="pills" role="group" aria-label="Filter by level">
              <button
                className={`badge ${level === "all" ? "primary" : ""}`}
                onClick={() => setLevel("all")}
                aria-pressed={level === "all"}
                aria-label="All levels"
              >
                All
              </button>
              {levels.map((l) => (
                <button
                  key={l}
                  className={`badge ${level === l ? "primary" : ""}`}
                  onClick={() => setLevel(level === l ? "all" : l)}
                  aria-pressed={level === l}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="pills" role="group" aria-label="Layout">
              <button
                className={`badge ${view === "grid" ? "primary" : ""}`}
                onClick={() => setView("grid")}
                aria-pressed={view === "grid"}
              >
                <LayoutGrid size={13} /> Grid
              </button>
              <button
                className={`badge ${view === "list" ? "primary" : ""}`}
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
              >
                <List size={13} /> List
              </button>
            </div>
          </div>
          {filtersOn && (
            <p
              className="muted mono"
              style={{ fontSize: 11, margin: "-12px 0 18px", display: "flex", gap: 10, alignItems: "center" }}
              role="status"
            >
              {filtered.length} of {rows.length} shown
              <button type="button" className="link-btn" onClick={clearFilters}>
                Clear filters
              </button>
            </p>
          )}
        </>
      )}

      {rows.length === 0 ? (
        <div className="dark-panel dark-panel--pad-xl" style={{ textAlign: "center", marginTop: 30 }}>
          {tab === "liked" ? <Heart size={28} className="rating" /> : tab === "saved" ? <Star size={28} className="rating" /> : <Download size={28} className="rating" />}
          <h3>{EMPTY[tab].title}</h3>
          <p className="muted">{EMPTY[tab].body}</p>
          <Link href="/browse" className="btn primary">Browse courses</Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dark-panel dark-panel--pad-xl" style={{ textAlign: "center", marginTop: 30 }}>
          <Search size={28} className="rating" />
          <h3>No courses match those filters.</h3>
          <p className="muted">Try a broader word, or a different level.</p>
          <button className="btn" onClick={clearFilters}>Clear filters</button>
        </div>
      ) : view === "grid" ? (
        <div className="course-grid" style={{ marginTop: 22 }}>
          {filtered.map((c) => (
            <LibraryCard key={c.id} course={c} tab={tab} />
          ))}
        </div>
      ) : (
        <div className="dark-panel dark-panel--pad-xs" style={{ marginTop: 22 }}>
          {filtered.map((c) => (
            <LibraryRow key={c.id} course={c} tab={tab} />
          ))}
        </div>
      )}
    </main>
  );
}
