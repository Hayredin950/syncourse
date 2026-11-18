"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { get } from "@/lib/api";
import type { CourseSummary } from "@/lib/types";
import { CourseCard } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";
import { SkCard } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth";

interface ForYou {
  source: "personalised" | "popular" | string;
  courses: CourseSummary[];
}

/**
 * The full "For you" shelf.
 *
 * The home rail shows a slice; this page is where a reader can see the whole
 * set without a carousel. The ranking is the same explainable profile the
 * course pages use — categories, tags, lecturers and level, nudged by what the
 * reader saved, downloaded, liked, rated and clicked. No embeddings, no model
 * call, so it costs nothing to render and nothing to explain.
 */
export default function ForYouPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<ForYou | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setData(null);
      return;
    }
    get<ForYou>("/recommendations/for-you?limit=24")
      .then(setData)
      .catch(() => setError(true));
  }, [user, loading]);

  const courses = data?.courses ?? [];

  return (
    <main className="page">
      <MobileHeader title="For you" />
      <div className="page-head">
        <div className="page-head__main">
          <span className="eyebrow">
            <Sparkles size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }} />
            Picked for you
          </span>
          <h1 className="display page-head__title">For you</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "58ch" }}>
            {data?.source === "personalised"
              ? "Built from what you have saved, downloaded and rated — the topics and lecturers you keep coming back to."
              : "Popular right now. Save, download or rate a course and this shelf starts reading your taste."}
          </p>
        </div>
      </div>

      {loading || (user && !data && !error) ? (
        <div className="grid" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <SkCard key={i} />
          ))}
        </div>
      ) : !user ? (
        <div className="dark-panel dark-panel--pad-xl" style={{ textAlign: "center", marginTop: 24 }}>
          <Sparkles size={28} className="rating" />
          <h2 style={{ margin: "12px 0 6px", fontSize: 20 }}>Sign in to get your shelf</h2>
          <p className="muted" style={{ maxWidth: "52ch", margin: "0 auto 18px" }}>
            Recommendations come from your own activity — the courses you save, download and rate. Until
            then this is just the popular list.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/auth?next=/recommendations" className="btn primary">
              Sign in
            </Link>
            <Link href="/browse" className="btn">
              Browse instead
            </Link>
          </div>
        </div>
      ) : error ? (
        <div className="dark-panel dark-panel--pad-xl" style={{ textAlign: "center", marginTop: 24 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>Could not load your shelf</h2>
          <p className="muted" style={{ margin: "0 0 16px" }}>
            The catalogue is still there — try again, or browse while it wakes up.
          </p>
          <Link href="/browse" className="btn">
            Browse the catalogue
          </Link>
        </div>
      ) : courses.length === 0 ? (
        <div className="dark-panel dark-panel--pad-xl" style={{ textAlign: "center", marginTop: 24 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>Nothing to recommend yet</h2>
          <p className="muted" style={{ margin: "0 0 16px" }}>
            Save or download a course and a shelf appears here on the next visit.
          </p>
          <Link href="/browse" className="btn primary">
            Find a first course
          </Link>
        </div>
      ) : (
        <div className="grid" style={{ marginTop: 22 }}>
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} fill />
          ))}
        </div>
      )}
    </main>
  );
}
