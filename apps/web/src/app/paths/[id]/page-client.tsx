"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, Star } from "lucide-react";
import { get } from "@/lib/api";
import type { CourseSummary } from "@/lib/types";
import { CourseRow } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";

interface PathDetail {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  courseCount: number;
  ratingAvg: number;
  totalVotes: number;
  courses: CourseSummary[];
}

export default function PathDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [path, setPath] = useState<PathDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    get<PathDetail>(`/learning-paths/${id}`)
      .then(setPath)
      .catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <main className="page">
        <MobileHeader title="Learning path" />
        <div className="dark-panel" style={{ padding: 40, textAlign: "center" }}>
          <h3>Learning path not found</h3>
          <p className="muted">It may have been removed.</p>
          <Link href="/paths" className="btn">All learning paths</Link>
        </div>
      </main>
    );
  }

  if (!path) {
    return (
      <main className="page">
        <MobileHeader title="Learning path" />
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="page">
      <MobileHeader title="Learning path" />

      {/* Franchise-style hero */}
      <div
        className="hero"
        style={{
          minHeight: 260,
          background: path.coverUrl
            ? `linear-gradient(180deg, rgba(14,13,11,.35), rgba(14,13,11,.94)), url(${path.coverUrl}) center/cover`
            : "linear-gradient(135deg, hsl(196 40% 24%), #12100e 70%)",
        }}
      >
        <div className="hero-content">
          <span className="eyebrow">Learning path · {path.courseCount} courses</span>
          <h1 className="display" style={{ fontSize: 38 }}>{path.title}</h1>
          {path.description && <p>{path.description}</p>}
          <div className="detail-meta">
            <span><Star size={13} fill="currentColor" className="rating" /> {path.ratingAvg.toFixed(1)} avg</span>
            <span>{path.totalVotes.toLocaleString()} votes</span>
            <span>{path.courseCount} courses</span>
          </div>
        </div>
      </div>

      {/* Course list — franchise-style numbered entries */}
      <section className="rail">
        <div className="section-head">
          <h2>Courses in this path</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {path.courses.map((c, i) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  minWidth: 28,
                  textAlign: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "hsl(var(--primary))",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <CourseRow course={c} />
              </div>
              <Link
                href={`/courses/${c.slug}`}
                aria-label={`Open ${c.title}`}
                className="icon-btn"
                style={{ flexShrink: 0 }}
              >
                <ChevronRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
