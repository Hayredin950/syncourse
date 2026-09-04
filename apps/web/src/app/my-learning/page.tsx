"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Heart, Star } from "lucide-react";
import { get } from "@/lib/api";
import type { LibraryData, LibraryCourse } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { MobileHeader } from "@/components/Nav";
import { SkRows } from "@/components/Skeleton";
import { LoadError } from "@/components/LoadError";

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

function MyLibrary() {
  const { token, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<LibraryData | null>(null);
  /* `.catch(() => {})` left `data` null, and null is the skeleton branch — so a
     dropped request shimmered here until the reader gave up and reloaded. */
  const [failed, setFailed] = useState(false);
  const wanted = params.get("tab");
  const [tab, setTab] = useState<Tab>(
    TABS.includes(wanted as Tab) ? (wanted as Tab) : "downloaded",
  );

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

  if (!token) return null;
  if (!data)
    return (
      <main className="page">
        <MobileHeader title="My Library" />
        <span className="eyebrow">Your library</span>
        <h1 className="display" style={{ fontSize: 42 }}>My Library</h1>
        <div style={{ marginTop: 18 }}>
          {failed ? (
            <LoadError title="We couldn't load your library" onRetry={load} />
          ) : (
            <SkRows n={6} label="Loading your library" />
          )}
        </div>
      </main>
    );

  const rows: LibraryCourse[] = data[tab];
  const when = (c: LibraryCourse) => c.downloadedAt ?? c.savedAt ?? c.likedAt ?? null;

  return (
    <main className="page">
      <MobileHeader title="My Library" />
      <span className="eyebrow">Your library</span>
      <h1 className="display" style={{ fontSize: 42 }}>My Library</h1>

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
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="dark-panel dark-panel--pad-xl" style={{ textAlign: "center", marginTop: 30 }}>
          {tab === "liked" ? <Heart size={28} className="rating" /> : tab === "saved" ? <Star size={28} className="rating" /> : <Download size={28} className="rating" />}
          <h3>{EMPTY[tab].title}</h3>
          <p className="muted">{EMPTY[tab].body}</p>
          <Link href="/browse" className="btn primary" style={{ display: "inline-block" }}>Browse courses</Link>
        </div>
      ) : (
        <div className="dark-panel dark-panel--pad-xs" style={{ marginTop: 28 }}>
          {rows.map((c) => (
            <Link key={c.id} href={`/courses/${c.slug}`} className="lesson">
              <span>{c.title.charAt(0).toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{c.title}</span>
              <span className="muted" style={{ marginRight: 12 }}>
                {c.ratingCount > 0 && (
                  <>
                    <Star size={11} fill="currentColor" className="rating" style={{ display: "inline", verticalAlign: "middle" }} /> {c.ratingAvg.toFixed(1)} ·{" "}
                  </>
                )}
                {c.level}
              </span>
              {when(c) && (
                <span className="muted mono" style={{ fontSize: 9 }}>
                  {new Date(when(c) as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
