"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, Plus, Star } from "lucide-react";
import { get } from "@/lib/api";
import type { CourseSummary, LecturerDetail } from "@/lib/types";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { formatDuration } from "@/lib/format";
import { CourseCard } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";

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
      <main className="page">
        <MobileHeader title="Lecturer" />
        <div className="dark-panel" style={{ padding: 40, textAlign: "center" }}>
          <p className="muted">{error ? "Lecturer not found" : "Loading…"}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <MobileHeader title="Lecturer" />

      <div className="profile-head">
        <div className="profile-row">
          <div className="avatar">
            {l.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cloudinaryUrl(l.photoUrl, { width: 192, height: 192 }) ?? undefined} alt={l.name} className="h-full w-full rounded-[20px] object-cover" />
            ) : (
              l.name.charAt(0)
            )}
          </div>
          <div>
            <span className="eyebrow">Lecturer</span>
            <h1 className="display" style={{ fontSize: 39, margin: "8px 0" }}>{l.name}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {l.credentials || "Practical teacher"} · {l.courses.length} courses taught
            </p>
          </div>
        </div>
        <button className="btn"><Plus size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Follow</button>
      </div>

      {l.bio && (
        <p className="muted" style={{ maxWidth: 700, lineHeight: 1.7, marginTop: 24 }}>{l.bio}</p>
      )}

      <section className="rail">
        <div className="section-head">
          <h2>Courses taught · {l.courses.length}</h2>
          <Link href="/browse">See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} /></Link>
        </div>
        <div className="rail-row">
          {l.courses.map((c) => (
            <CourseCard key={c.id} course={toSummary(c)} />
          ))}
        </div>
      </section>

      {/* all courses list */}
      <section className="rail">
        <div className="section-head">
          <h2>All courses</h2>
        </div>
        <div className="dark-panel">
          {l.courses.map((c) => (
            <Link key={c.id} href={`/courses/${c.slug}`} className="lesson">
              <span>{String(l.courses.indexOf(c) + 1).padStart(2, "0")}</span>
              <span>{c.title}</span>
              <span className="muted" style={{ marginLeft: "auto", marginRight: 14 }}>
                <Star size={11} fill="currentColor" className="rating" style={{ display: "inline", verticalAlign: "middle" }} /> {c.ratingAvg.toFixed(1)}
              </span>
              <span className="muted">{formatDuration(c.durationMin)}</span>
            </Link>
          ))}
          {l.courses.length === 0 && <div className="dark-panel" style={{ padding: 30, textAlign: "center" }}><p className="muted" style={{ margin: 0 }}>No courses published yet.</p></div>}
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
