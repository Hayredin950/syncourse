"use client";

import Link from "next/link";
import type { CourseSummary } from "@/lib/types";
import { compact, formatDuration, ratingColor } from "@/lib/format";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { Stars } from "./StarRating";

export function CourseCard({ course, rank }: { course: CourseSummary; rank?: number }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group block w-[130px] shrink-0 snap-start sm:w-[140px]"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-surface">
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cloudinaryUrl(course.thumbnailUrl, { width: 280, height: 420 }) ?? undefined}
            alt={course.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl">🎓</div>
        )}
        {rank !== undefined && (
          <span className="absolute left-1 top-0 text-2xl font-bold text-text/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {rank}
          </span>
        )}
        {course.isNew && (
          <span className="absolute right-1 top-1 rounded-sm bg-success px-1.5 py-0.5 text-[10px] font-semibold text-black">
            Added
          </span>
        )}
        {course.isPremium && (
          <span className="absolute bottom-1 left-1 rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-bold text-black">
            Premium
          </span>
        )}
      </div>
      <div className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug text-text">{course.title}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
        <span className={ratingColor(course.ratingAvg)}>{course.ratingAvg.toFixed(1)}</span>
        <span className="text-dim">·</span>
        <span>{course.level}</span>
        <span className="text-dim">·</span>
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
      <div className="h-[72px] w-[48px] shrink-0 overflow-hidden rounded-md bg-surface">
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cloudinaryUrl(course.thumbnailUrl, { width: 96, height: 144 }) ?? undefined} alt={course.title} loading="lazy" className="h-full w-full object-cover" />
        ) : null}
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
