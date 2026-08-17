"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { Bookmark, Check, Star, Play } from "lucide-react";
import type { CourseSummary } from "@/lib/types";
import { compact, formatDuration } from "@/lib/format";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { useAuth } from "@/lib/auth";

export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

const TYPE_ICONS: Record<string, string> = {
  course: "🎓",
  "mini-course": "⚡",
  "cheat-sheet": "📄",
  roadmap: "🗺️",
};

/** Course cover: branded gradient derived from slug + title mark, exactly like the replica. */
export function CoverArt({
  course,
  mark = true,
  large = false,
  badges = true,
}: {
  course: CourseSummary;
  mark?: boolean;
  large?: boolean;
  badges?: boolean;
}) {
  const hue = hueFromString(course.slug || course.id);
  const a = `hsl(${hue} 42% 18%)`;
  const b = `hsl(${(hue + 55) % 360} 50% 9%)`;
  const words = (course.title || "Course")
    .replace(/[—–\-:]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.toUpperCase());
  const code = course.contentType
    ? course.contentType === "mini-course"
      ? "MINI"
      : course.contentType === "cheat-sheet"
        ? "SHEET"
        : course.contentType === "roadmap"
          ? "MAP"
          : "CRS"
    : "CRS";

  return (
    <div
      className="cover"
      style={
        {
          "--cover-a": a,
          "--cover-b": b,
          ...(large ? { aspectRatio: "1.2" } : {}),
        } as CSSProperties
      }
    >
      {course.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cloudinaryUrl(course.thumbnailUrl, { width: 280, height: 420 }) ?? undefined}
          alt={course.title}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ zIndex: 0 }}
        />
      ) : (
        <span className="cover-code">
          SC / {code} · {course.level.slice(0, 3).toUpperCase()}
        </span>
      )}
      {mark && !course.thumbnailUrl && (
        <span className="cover-mark">
          {words.map((line) => (
            <span key={line} style={{ display: "block" }}>
              {line}
            </span>
          ))}
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
  /** Fill its grid cell (browse grid) instead of a fixed rail width. */
  fill?: boolean;
  /** Wide 16:9 hero variant. */
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((r) => r.json())
      .then((d: { saved?: boolean }) => setSaved(Boolean(d.saved)))
      .catch(() => undefined);
  };

  return (
    <Link href={`/courses/${course.slug}`} className="course-card" data-testid={`card-course-${course.slug}`}>
      <div className="cover-wrap" style={{ position: "relative" }}>
        <CoverArt course={course} large={wide} />
        {rank !== undefined && (
          <span
            className="cover-badge"
            style={{
              position: "absolute",
              left: 8,
              top: 6,
              background: "rgba(0,0,0,.55)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 800,
              zIndex: 2,
            }}
          >
            {rank}
          </span>
        )}
        <button
          onClick={toggleSave}
          title={saved ? "Remove from watchlist" : "Add to watchlist"}
          className="save-icon"
          style={{ position: "absolute", right: 8, top: 8, zIndex: 2 }}
          aria-label="Save"
        >
          {saved ? <Check size={14} /> : <Bookmark size={14} />}
        </button>
        {/* quick open — desktop hover only */}
        <span
          className="quick-open"
          style={{ position: "absolute", inset: 0, zIndex: 1, display: "none" }}
        />
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
      {course.progress !== undefined && (
        <div style={{ height: 3, background: "#2c2924", marginTop: 8, borderRadius: 5 }}>
          <div style={{ width: `${course.progress}%`, height: "100%", background: "hsl(var(--primary))", borderRadius: 5 }} />
        </div>
      )}
      {/* desktop hover quick actions */}
      <span className="hidden md:block" />
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
        <CoverArt course={course} mark={false} badges={false} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm font-medium text-text">{course.title}</div>
        <div className="line-clamp-1 text-xs text-muted">{course.description}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
          <Star size={11} fill="currentColor" className="rating" />
          <span className="rating">{course.ratingAvg.toFixed(1)}</span>
          <span className="text-dim">·</span>
          <span>{compact(course.enrollmentCount)} students</span>
          <span className="text-dim">·</span>
          <span>{formatDuration(course.durationMin)}</span>
        </div>
      </div>
      <Play size={14} className="text-dim" />
    </Link>
  );
}
