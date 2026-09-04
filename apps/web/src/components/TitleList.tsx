"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bookmark, Check, Download, LayoutGrid, List, Play } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cloudinaryUrl } from "@/lib/cloudinary";
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
  const [saved, setSaved] = useState(false);
  const hue = hueFromString(course.slug || course.id);
  const typeLabel =
    course.contentType === "mini-course" ? "Mini-course"
      : course.contentType === "cheat-sheet" ? "Cheat-sheet"
      : course.contentType === "roadmap" ? "Roadmap"
      : "Course";
  const year = course.publishedAt ? new Date(course.publishedAt).getUTCFullYear() : null;

  const toggleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!token) {
      router.push("/auth?next=" + encodeURIComponent(`/courses/${course.slug}`));
      return;
    }
    void fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/courses/${course.slug}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: { saved?: boolean }) => setSaved(Boolean(d.saved)))
      .catch(() => undefined);
  };

  return (
    <Link href={`/courses/${course.slug}`} className="title-row">
      <span className="title-row__index">{String(index).padStart(2, "0")}</span>
      <div className="title-row__thumb" style={{ background: `linear-gradient(145deg, hsl(${hue} 42% 20%), hsl(${(hue + 55) % 360} 50% 10%))` }}>
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cloudinaryUrl(course.thumbnailUrl, { width: 220, height: 140 }) ?? undefined} alt={course.title} loading="lazy" />
        ) : (
          <span className="muted">{typeLabel.charAt(0)}</span>
        )}
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
