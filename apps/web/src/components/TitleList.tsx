"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bookmark, Check, Download, LayoutGrid, List, Play } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { post } from "@/lib/api";
import { CoverImage } from "@/components/CoverImage";
import { Toast } from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import { compact, formatDuration, plural } from "@/lib/format";
import { hueFromString } from "@/components/CourseCard";

export type EntityCourse = {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnailUrl: string | null;
  level: string;
  durationMin: number;
  ratingAvg: number;
  ratingCount: number;
  downloadCount: number;
  lessonCount?: number;
  isPremium?: boolean;
  saved?: boolean;
  publishedAt?: string;
  contentType?: string;
};

/** 5-star visual + numeric score + vote count (phonofilm title-row pattern) */
export function Stars({ value, votes }: { value: number; votes: number }) {
  const full = Math.round(value);
  // Nobody has rated it yet — five empty stars and "0.0 · 0 votes" reads as a
  // course that was reviewed and failed.
  if (!votes) return <span className="muted" style={{ fontSize: 11 }}>Not yet rated</span>;
  return (
    <span className="title-stars" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ letterSpacing: 1, color: "hsl(var(--primary))", fontSize: 11 }}>
        {[1, 2, 3, 4, 5].map((n) => (n <= full ? "★" : "☆")).join("")}
      </span>
      <span className="rating" style={{ fontSize: 11 }}>{value.toFixed(1)}</span>
      <span className="muted" style={{ fontSize: 11 }}>· {compact(votes)} votes</span>
    </span>
  );
}

/** one numbered title row — thumbnail, title, year, duration, type badge, description, stars, action icons */
export function TitleRow({ course, index }: { course: EntityCourse; index: number }) {
  const router = useRouter();
  const { token } = useAuth();
  const [saved, setSaved] = useState(Boolean(course.saved));
  const [saving, setSaving] = useState(false);
  const { toast, setToast } = useToast();
  useEffect(() => {
    setSaved(Boolean(course.saved));
  }, [course.saved]);
  const hue = hueFromString(course.slug || course.id);
  const typeLabel =
    course.contentType === "mini-course" ? "Mini-course"
      : course.contentType === "cheat-sheet" ? "Cheat-sheet"
      : course.contentType === "roadmap" ? "Roadmap"
      : "Course";
  const year = course.publishedAt ? new Date(course.publishedAt).getUTCFullYear() : null;

  const toggleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!token) {
      router.push("/auth?next=" + encodeURIComponent(`/courses/${course.slug}`));
      return;
    }
    if (saving) return;
    const prior = saved;
    setSaved(!prior);
    setSaving(true);
    try {
      const result = await post<{ saved?: boolean }>(`/courses/${course.slug}/save`);
      if (typeof result?.saved === "boolean") setSaved(result.saved);
    } catch (err) {
      setSaved(prior);
      setToast(err instanceof Error ? err.message : "Could not update your library");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Link href={`/courses/${course.slug}`} className="title-row">
      <span className="title-row__index">{String(index).padStart(2, "0")}</span>
      <div className="title-row__thumb" style={{ background: `linear-gradient(145deg, hsl(${hue} 42% 20%), hsl(${(hue + 55) % 360} 50% 10%))` }}>
        {/* Letter first, thumbnail over it — see CoverImage. */}
        <span className="muted">{typeLabel.charAt(0)}</span>
        <CoverImage src={course.thumbnailUrl} transform={{ width: 220, height: 140 }} alt={course.title} />
      </div>
      <div className="title-row__main">
        <div className="title-row__title">{course.title}</div>
        <div className="title-row__meta">
          {year && <span>{year}</span>}
          {course.durationMin > 0 && <span>{formatDuration(course.durationMin)}</span>}
          <span className="badge" style={{ fontSize: 9 }}>{typeLabel}</span>
          <span className="muted">{course.level}</span>
        </div>
        <div className="title-row__desc">{course.description}</div>
        <Stars value={course.ratingAvg} votes={course.ratingCount} />
      </div>
      <div className="title-row__actions">
        <button
          className="icon-btn"
          title="Preview"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            router.push(`/courses/${course.slug}`);
          }}
        >
          <Play size={13} />
        </button>
        <button
          className="icon-btn"
          title="Download materials"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            router.push(`/courses/${course.slug}?download=1`);
          }}
        >
          <Download size={13} />
        </button>
        <button className="icon-btn" title={saved ? "Saved" : "Save"} onClick={toggleSave}>
          {saved ? <Check size={13} className="rating" /> : <Bookmark size={13} />}
        </button>
      </div>
    </Link>
    <Toast message={toast} />
    </>
  );
}

export type SortMode = "top" | "newest" | "az";
export type ViewMode = "list" | "grid";

/** Filter / Sort / view-toggle toolbar (phonofilm entity pages) */
export function TitleToolbar({
  total,
  sort,
  setSort,
  view,
  setView,
  onFilter,
}: {
  total: number;
  sort: SortMode;
  setSort: (s: SortMode) => void;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  onFilter: (q: string) => void;
}) {
  return (
    <div className="titles-toolbar">
      <h2>
        Titles <span className="muted">{plural(total, "title")}</span>
      </h2>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          className="filter-search"
          style={{ width: 180, height: 36 }}
          placeholder="Filter titles…"
          onChange={(e) => onFilter(e.target.value)}
        />
        <select className="toolbar-select" value={sort} onChange={(e) => setSort(e.target.value as SortMode)} aria-label="Sort">
          <option value="top">Top rated</option>
          <option value="newest">Newest</option>
          <option value="az">A–Z</option>
        </select>
        <div className="view-toggle" role="group" aria-label="View">
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="List view">
            <List size={14} />
          </button>
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid view">
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
