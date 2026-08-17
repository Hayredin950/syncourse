"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { get } from "@/lib/api";
import type { LecturerDetail } from "@/lib/types";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { formatDuration, ratingColor } from "@/lib/format";
import { Stars } from "@/components/StarRating";

export default function LecturerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [l, setL] = useState<LecturerDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    get<LecturerDetail>(`/lecturers/${slug}`)
      .then(setL)
      .catch(() => setError(true));
  }, [slug]);

  if (error || !l) {
    return (
      <div className="p-4 text-center text-sm text-muted">{error ? "Lecturer not found" : "Loading…"}</div>
    );
  }

  const knownFor = [...l.courses].sort((a, b) => b.ratingAvg - a.ratingAvg).slice(0, 6);

  return (
    <div className="pb-6">
      <div className="flex flex-col items-center border-b border-border px-4 py-6 text-center">
        {l.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cloudinaryUrl(l.photoUrl, { width: 192, height: 192 }) ?? undefined}
            alt={l.name}
            className="h-24 w-24 rounded-full bg-surface object-cover"
          />
        ) : (
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-surface-raised text-4xl font-bold text-accent">
            {l.name.charAt(0)}
          </span>
        )}
        <h1 className="mt-3 text-xl font-bold text-text">{l.name}</h1>
        {l.credentials && <div className="mt-1 text-sm font-medium text-accent">{l.credentials}</div>}
        {l.bio && <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">{l.bio}</p>}
      </div>

      <div className="px-4 pt-5">
        <h2 className="mb-3 text-base font-semibold text-text">Known for</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
          {knownFor.map((c) => (
            <Link key={c.id} href={`/courses/${c.slug}`} className="group min-w-0">
              <div className="aspect-[2/3] overflow-hidden rounded-lg bg-surface">
                {c.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cloudinaryUrl(c.thumbnailUrl, { width: 300, height: 450 }) ?? undefined}
                    alt={c.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl">🎓</div>
                )}
              </div>
              <div className="mt-1.5 line-clamp-2 min-w-0 text-[13px] font-medium leading-snug text-text">{c.title}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="px-4 pt-6">
        <h2 className="mb-2 text-base font-semibold text-text">All courses · {l.courses.length}</h2>
        <div className="divide-y divide-border rounded-lg border border-border">
          {l.courses.map((c) => (
            <Link key={c.id} href={`/courses/${c.slug}`} className="flex items-center gap-3 bg-surface px-3 py-2.5 hover:bg-surface-hover">
              <div className="h-9 w-14 shrink-0 overflow-hidden rounded-md bg-bg">
                {c.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cloudinaryUrl(c.thumbnailUrl, { width: 96, height: 144 }) ?? undefined} alt={c.title} loading="lazy" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-1 text-sm font-medium text-text">{c.title}</div>
                <div className="text-[11px] text-muted">{formatDuration(c.durationMin)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
                <Stars value={c.ratingAvg} size={11} />
                <span className={ratingColor(c.ratingAvg)}>{c.ratingAvg.toFixed(1)}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
