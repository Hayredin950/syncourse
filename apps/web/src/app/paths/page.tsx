"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { get } from "@/lib/api";
import { plural } from "@/lib/format";
import type { LearningPathRow } from "@/lib/types";
import { MobileHeader } from "@/components/Nav";
import { SkCards } from "@/components/Skeleton";
import { LoadError } from "@/components/LoadError";

export default function PathsPage() {
  const [paths, setPaths] = useState<LearningPathRow[]>([]);
  const [loading, setLoading] = useState(true);
  /* A failed request used to land on the empty state below, which says the first
     paths "are on the way" — reassuring, and wrong. */
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    get<LearningPathRow[]>("/learning-paths")
      .then(setPaths)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  return (
    <main className="page">
      <MobileHeader title="Learning paths" />
      <span className="eyebrow">Learning paths</span>
      <h1 className="display page-head__title">
        Featured learning paths
      </h1>
      <p className="muted mono" style={{ fontSize: 11, margin: 0 }}>
        {loading ? "…" : failed ? "—" : plural(paths.length, "path")}
      </p>

      {loading ? (
        <div style={{ marginTop: 24 }}>
          <SkCards n={3} grid="path-grid" label="Loading learning paths" />
        </div>
      ) : failed ? (
        <div style={{ marginTop: 24 }}>
          <LoadError title="We couldn't load the learning paths" onRetry={load} />
        </div>
      ) : paths.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="empty-icon">🗺️</div>
          <h3 style={{ margin: "0 0 6px" }}>No learning paths yet</h3>
          <p>A path stitches several courses into one order worth following. The first ones are on the way.</p>
        </div>
      ) : (
        <div className="path-grid" style={{ marginTop: 24 }}>
          {paths.map((p) => (
            <Link key={p.id} href={`/paths/${p.id}`} className="dark-panel path-card">
              <span className="eyebrow">Learning path</span>
              <h3 style={{ margin: "14px 0 8px", fontSize: 17 }}>{p.title}</h3>
              {p.description && <p className="muted" style={{ margin: 0, fontSize: 11 }}>{p.description}</p>}
              {p.courses.length > 0 && (
                <div className="path-card__strip">
                  {p.courses.slice(0, 4).map((c) => (
                    <div key={c.id} className="cover" style={{ aspectRatio: "0.8", borderRadius: "var(--r-xs)", margin: 0 }}>
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
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
