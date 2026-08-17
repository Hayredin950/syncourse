"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { get } from "@/lib/api";
import type { LearningPathRow } from "@/lib/types";
import { MobileHeader } from "@/components/Nav";

export default function PathsPage() {
  const [paths, setPaths] = useState<LearningPathRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<LearningPathRow[]>("/learning-paths")
      .then(setPaths)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page">
      <MobileHeader title="Learning paths" />
      <span className="eyebrow">Learning paths</span>
      <h1 className="display" style={{ fontSize: 38, marginBottom: 5 }}>
        Featured learning paths
      </h1>
      <p className="muted mono" style={{ fontSize: 11, margin: 0 }}>
        {loading ? "…" : `${paths.length} paths`}
      </p>

      {loading ? (
        <div className="grid">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : (
        <div className="grid">
          {paths.map((p) => (
            <Link
              key={p.id}
              href={`/paths/${p.id}`}
              className="dark-panel"
              style={{
                padding: 18,
                background: "linear-gradient(135deg, hsl(196 40% 24%), #12100e 70%)",
                display: "block",
              }}
            >
              <span className="eyebrow">Learning path</span>
              <h3 style={{ margin: "14px 0 8px", fontSize: 17 }}>{p.title}</h3>
              {p.description && <p className="muted" style={{ margin: 0, fontSize: 11 }}>{p.description}</p>}
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
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
