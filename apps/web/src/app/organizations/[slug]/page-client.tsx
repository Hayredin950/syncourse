"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, Plus, Star } from "lucide-react";
import { get } from "@/lib/api";
import type { CourseSummary, OrganizationDetail } from "@/lib/types";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { compact, formatDuration } from "@/lib/format";
import { CourseCard } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";

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
      <main className="page">
        <MobileHeader title="Channel" />
        <div className="dark-panel" style={{ padding: 40, textAlign: "center" }}>
          <p className="muted">{error ? "Channel not found" : "Loading…"}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <MobileHeader title="Channel" />
      <div className="profile-head">
        <div className="profile-row">
          <div className="avatar">
            {o.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cloudinaryUrl(o.logoUrl, { width: 160, height: 160 }) ?? undefined} alt={o.name} className="h-full w-full rounded-[20px] object-cover" />
            ) : (
              o.name.charAt(0)
            )}
          </div>
          <div>
            <span className="eyebrow">Publisher</span>
            <h1 className="display" style={{ fontSize: 39, margin: "8px 0" }}>{o.name}</h1>
            <p className="muted" style={{ margin: 0 }}>
              Publisher · {compact(o.subscribers)} learners · {o.courses.length} courses
            </p>
          </div>
        </div>
        <button className="btn"><Plus size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Follow</button>
      </div>

      {o.description && (
        <p className="muted" style={{ maxWidth: 700, lineHeight: 1.7, marginTop: 24 }}>{o.description}</p>
      )}

      <section className="rail">
        <div className="section-head">
          <h2>Catalog · {o.courses.length}</h2>
          <Link href="/browse">See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
        </div>
        <div className="rail-row">
          {o.courses.map((c) => (
            <CourseCard key={c.id} course={toSummary(c)} />
          ))}
        </div>
      </section>

      <section className="rail">
        <div className="section-head">
          <h2>All courses</h2>
        </div>
        <div className="dark-panel">
          {o.courses.map((c) => (
            <Link key={c.id} href={`/courses/${c.slug}`} className="lesson">
              <span>{String(o.courses.indexOf(c) + 1).padStart(2, "0")}</span>
              <span>{c.title}</span>
              <span className="muted" style={{ marginLeft: "auto", marginRight: 14 }}>
                <Star size={11} fill="currentColor" className="rating" style={{ display: "inline", verticalAlign: "middle" }} /> {c.ratingAvg.toFixed(1)}
              </span>
              <span className="muted">{c.level} · {formatDuration(c.durationMin)}</span>
            </Link>
          ))}
          {o.courses.length === 0 && <div className="dark-panel" style={{ padding: 30, textAlign: "center" }}><p className="muted" style={{ margin: 0 }}>No courses published yet.</p></div>}
        </div>
      </section>
    </main>
  );
}

function toSummary(c: {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnailUrl: string | null;
  level: string;
  durationMin: number;
  ratingAvg: number;
  ratingCount: number;
  enrollmentCount: number;
}): CourseSummary {
  return { ...c, lessonCount: 0, downloadCount: 0, isPremium: false, isFeatured: false, contentType: "course", categoryNames: [], lecturerName: null, organizationName: null, publishedAt: "" };
}
