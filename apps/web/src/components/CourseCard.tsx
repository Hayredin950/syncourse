"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CourseSummary } from "@/lib/types";
import { compact, formatDuration, ratingColor } from "@/lib/format";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { Stars } from "./StarRating";
import { useAuth } from "@/lib/auth";

const TYPE_ICONS: Record<string, string> = {
  course: "🎓",
  "mini-course": "⚡",
  "cheat-sheet": "📄",
  roadmap: "🗺️",
};

export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function CoverArt({ course, ratio = "2/3" }: { course: CourseSummary; ratio?: string }) {
  const hue = hueFromString(course.slug || course.id);
  const icon = TYPE_ICONS[course.contentType] ?? "🎓";
  return (
    <div
      className={`relative flex w-full items-center justify-center overflow-hidden ${ratio === "2/3" ? "aspect-[2/3]" : "aspect-[16/9]"}`}
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 42% 18%), hsl(${(hue + 55) % 360} 50% 9%))`,
      }}
    >
      {course.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cloudinaryUrl(course.thumbnailUrl, ratio === "2/3" ? { width: 280, height: 420 } : { width: 420, height: 236 }) ?? undefined}
          alt={course.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <>
          <span className="text-3xl opacity-90">{icon}</span>
          <span
            className="absolute left-2.5 top-2.5 h-0.5 w-8 rounded-full"
            style={{ background: "hsl(39 91% 55%)" }}
          />
        </>
      )}
      {course.isNew && (
        <span className="absolute left-1 top-1 rounded-sm bg-success px-1.5 py-0.5 text-[10px] font-semibold text-black">
          Added
        </span>
      )}
      {course.isPremium && (
        <span className="absolute bottom-1 left-1 rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-bold text-black">
          Premium
        </span>
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

  const widthCls = fill ? "w-full" : "w-[130px] shrink-0 snap-start sm:w-[140px] md:w-[150px]";

  return (
    <div className={`group relative min-w-0 ${widthCls}`}>
      <Link href={`/courses/${course.slug}`} className="block min-w-0">
        <div className="relative overflow-hidden rounded-lg bg-surface">
          <CoverArt course={course} ratio={wide ? "16/9" : "2/3"} />
          {rank !== undefined && (
            <span className="absolute left-1 top-0 text-2xl font-bold text-text/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              {rank}
            </span>
          )}
        </div>
        <div className={`mt-1.5 line-clamp-2 min-w-0 leading-snug text-text ${wide ? "text-[15px] font-semibold" : "text-[13px] font-medium"}`}>
          {course.title}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
          <span className={ratingColor(course.ratingAvg)}>★ {course.ratingAvg.toFixed(1)}</span>
          <span className="text-dim">·</span>
          <span>{course.level}</span>
          <span className="text-dim">·</span>
          <span>{formatDuration(course.durationMin)}</span>
        </div>
      </Link>

      {/* quick actions — desktop hover only */}
      <div className="absolute right-1 top-1 z-10 hidden items-center gap-1 md:group-hover:flex">
        <button
          onClick={toggleSave}
          title={saved ? "Remove from watchlist" : "Add to watchlist"}
          className={`flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-xs backdrop-blur transition-colors hover:bg-black/80 ${
            saved ? "text-accent" : "text-white"
          }`}
        >
          {saved ? "♥" : "♡"}
        </button>
        <Link
          href={`/courses/${course.slug}`}
          title="Open course"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-xs text-white backdrop-blur transition-colors hover:bg-black/80"
        >
          ▶
        </Link>
      </div>
    </div>
  );
}

export function CourseRow({ course }: { course: CourseSummary }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-hover"
    >
      <div className="h-[72px] w-[48px] shrink-0 overflow-hidden rounded-md bg-surface">
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cloudinaryUrl(course.thumbnailUrl, { width: 96, height: 144 }) ?? undefined} alt={course.title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: `linear-gradient(145deg, hsl(${hueFromString(course.slug)} 42% 18%), hsl(${(hueFromString(course.slug) + 55) % 360} 50% 9%))` }}
          >
            <span className="text-sm">{TYPE_ICONS[course.contentType] ?? "🎓"}</span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm font-medium text-text">{course.title}</div>
        <div className="line-clamp-1 text-xs text-muted">{course.description}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
          <Stars value={course.ratingAvg} size={11} />
          <span className={ratingColor(course.ratingAvg)}>{course.ratingAvg.toFixed(1)}</span>
          <span className="text-dim">·</span>
          <span>{compact(course.enrollmentCount)} students</span>
        </div>
      </div>
    </Link>
  );
}
