"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Check, Download, Eye, Star, Play } from "lucide-react";
import type { CourseSummary } from "@/lib/types";
import { compact, formatDuration } from "@/lib/format";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { useAuth } from "@/lib/auth";

export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/**
 * Course cover — real image when available (badges overlay cleanly at the
 * corners), branded gradient + icon fallback when a cover hasn't been
 * uploaded yet. No internal type/level codes ever reach the UI.
 */
export function CoverArt({
  course,
  large = false,
  badges = true,
}: {
  course: CourseSummary;
  large?: boolean;
  badges?: boolean;
}) {
  const hue = hueFromString(course.slug || course.id);
  const icon =
    course.contentType === "mini-course" ? "⚡" : course.contentType === "cheat-sheet" ? "📄" : course.contentType === "roadmap" ? "🗺️" : "🎓";

  return (
    <div
      className={`cover ${large ? "cover-wide" : ""}`}
      style={
        {
          "--cover-a": `hsl(${hue} 42% 18%)`,
          "--cover-b": `hsl(${(hue + 55) % 360} 50% 9%)`,
          ...(large ? { aspectRatio: "1.2" } : {}),
        } as React.CSSProperties
      }
    >
      {course.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cloudinaryUrl(course.thumbnailUrl, { width: large ? 420 : 280, height: large ? 350 : 420 }) ?? undefined}
          alt={course.title}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ zIndex: 0 }}
        />
      ) : (
        <span className="cover-mark" style={{ fontSize: 30, fontWeight: 800 }}>
          {icon}
        </span>
      )}
      {badges && (
        <>
          {course.isNew && <span className="cover-badge added">Added</span>}
          {course.isPremium && <span className="cover-badge premium">Premium</span>}
        </>
      )}
    </div>
  );
}

export function CourseCard({
  course,
  rank,
  fill,
  wide,
}: {
  course: CourseSummary;
  rank?: number;
  fill?: boolean;
  wide?: boolean;
}) {
  const router = useRouter();
  const { token } = useAuth();
  const [saved, setSaved] = useState(false);

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
    <Link href={`/courses/${course.slug}`} className={`course-card ${fill ? "course-card-fill" : ""}`} data-testid={`card-course-${course.slug}`}>
      <div className="cover-wrap" style={{ position: "relative" }}>
        <CoverArt course={course} large={wide} />
        {rank !== undefined && (
          <span
            className="cover-badge rank"
            style={{ position: "absolute", left: 8, top: 6, zIndex: 2 }}
          >
            {rank}
          </span>
        )}
        {/* hover quick actions — desktop only */}
        <div className="quick-actions">
          <button
            onClick={toggleSave}
            title={saved ? "Remove from your library" : "Save for later"}
            className="quick-action"
            aria-label="Save"
          >
            {saved ? <Check size={14} /> : <Bookmark size={14} />}
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/courses/${course.slug}`);
            }}
            title="Preview"
            className="quick-action"
            aria-label="Preview"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/courses/${course.slug}?download=1`);
            }}
            title="Download materials"
            className="quick-action"
            aria-label="Download"
          >
            <Download size={14} />
          </button>
        </div>
      </div>
      <div className="card-title">{course.title}</div>
      <div className="card-meta">
        <span className="rating">
          <Star size={10} fill="currentColor" /> {course.ratingAvg.toFixed(1)}
        </span>
        <span>{course.level}</span>
        <span>·</span>
        <span>{formatDuration(course.durationMin)}</span>
      </div>
    </Link>
  );
}

export function CourseRow({ course }: { course: CourseSummary }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-hover"
    >
      <div className="h-[72px] w-[48px] shrink-0 overflow-hidden rounded-md" style={{ position: "relative" }}>
        <CoverArt course={course} badges={false} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm font-medium text-text">{course.title}</div>
        <div className="line-clamp-1 text-xs text-muted">{course.description}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
          <Star size={11} fill="currentColor" className="rating" />
          <span className="rating">{course.ratingAvg.toFixed(1)}</span>
          <span className="text-dim">·</span>
          <span>{compact(course.downloadCount)} downloads</span>
          <span className="text-dim">·</span>
          <span>{formatDuration(course.durationMin)}</span>
        </div>
      </div>
      <Play size={14} className="text-dim" />
    </Link>
  );
}
