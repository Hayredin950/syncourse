"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { get } from "@/lib/api";
import type { OrganizationDetail } from "@/lib/types";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { compact, formatDuration, ratingColor } from "@/lib/format";
import { Stars } from "@/components/StarRating";

export default function OrganizationPage() {
  const { slug } = useParams<{ slug: string }>();
  const [o, setO] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    get<OrganizationDetail>(`/organizations/${slug}`)
      .then(setO)
      .catch(() => setError(true));
  }, [slug]);

  if (error || !o) {
    return (
      <div className="p-4 text-center text-sm text-muted">{error ? "Organization not found" : "Loading…"}</div>
    );
  }

  return (
    <div className="pb-6">
      <div className="flex flex-col items-center border-b border-border px-4 py-6 text-center">
        {o.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cloudinaryUrl(o.logoUrl, { width: 160, height: 160 }) ?? undefined}
            alt={o.name}
            className="h-20 w-20 rounded-2xl bg-surface object-contain"
          />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-raised text-3xl font-bold text-accent">
            {o.name.charAt(0)}
          </span>
        )}
        <h1 className="mt-3 text-xl font-bold text-text">{o.name}</h1>
        {o.description && <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">{o.description}</p>}
        <div className="mt-2 text-[11px] text-dim">
          {compact(o.subscribers)} subscribers · {o.courses.length} courses
        </div>
      </div>

      <div className="px-4 pt-5">
        <h2 className="mb-2 text-base font-semibold text-text">Catalog · {o.courses.length} courses</h2>
        <div className="divide-y divide-border rounded-lg border border-border">
          {o.courses.map((c) => (
            <Link key={c.id} href={`/courses/${c.slug}`} className="flex items-center gap-3 bg-surface px-3 py-2.5 hover:bg-surface-hover">
              <div className="h-9 w-14 shrink-0 overflow-hidden rounded-md bg-bg">
                {c.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cloudinaryUrl(c.thumbnailUrl, { width: 96, height: 144 }) ?? undefined} alt={c.title} loading="lazy" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-1 text-sm font-medium text-text">{c.title}</div>
                <div className="text-[11px] text-muted">
                  {c.level} · {formatDuration(c.durationMin)}
                </div>
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
