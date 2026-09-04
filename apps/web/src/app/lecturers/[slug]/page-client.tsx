"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { get } from "@/lib/api";
import type { LecturerDetail } from "@/lib/types";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { CourseCard } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";
import { ShareButton } from "@/components/ShareButton";
import { SkEntityPage } from "@/components/Skeleton";
import { TitleRow, TitleToolbar, type EntityCourse, type SortMode, type ViewMode } from "@/components/TitleList";

export default function LecturerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [l, setL] = useState<LecturerDetail | null>(null);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<SortMode>("top");
  const [view, setView] = useState<ViewMode>("list");
  const [filterQ, setFilterQ] = useState("");

  useEffect(() => {
    get<LecturerDetail>(`/lecturers/${slug}`)
      .then(setL)
      .catch(() => setError(true));
  }, [slug]);

  const courses = useMemo(() => {
    if (!l) return [];
    let list = [...l.courses] as EntityCourse[];
    if (filterQ.trim()) {
      const q = filterQ.toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q));
    }
    if (sort === "top") list.sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount);
    if (sort === "newest") list.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
    if (sort === "az") list.sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [l, sort, filterQ]);

  if (error) {
    return (
      <main className="page">
        <MobileHeader title="Lecturer" />
        <div className="empty-state" style={{ padding: "48px 24px" }}>
          <div className="empty-icon">🔎</div>
          <h3 style={{ margin: "0 0 6px" }}>We can&apos;t find that lecturer</h3>
          <p>The page may have moved, or the name may have changed.</p>
          <Link href="/lecturers" className="btn" style={{ marginTop: 18 }}>All lecturers</Link>
        </div>
      </main>
    );
  }

  if (!l) {
    return (
      <main className="page">
        <MobileHeader title="Lecturer" />
        <SkEntityPage label="Loading the lecturer" />
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
        <ShareButton title={`${l.name} on Syncourse`} label="Share lecturer" />
      </div>

      {l.bio && (
        <p className="muted" style={{ maxWidth: 700, lineHeight: 1.7, marginTop: 24 }}>{l.bio}</p>
      )}

      <section className="rail">
        <div className="section-head">
          <h2>Known for</h2>
        </div>
        <div className="rail-row">
          {l.courses.slice(0, 6).map((c) => (
            <CourseCard key={c.id} course={toSummary(c)} />
          ))}
        </div>
      </section>

      <TitleToolbar total={courses.length} sort={sort} setSort={setSort} view={view} setView={setView} onFilter={setFilterQ} />

      {view === "grid" ? (
        /* `.grid`, not `.rail-row`: the toggle said Grid and rendered a
           horizontal scroller, so the button that promised to show everything at
           once showed one row you had to swipe sideways. The stray
           `gridAutoColumns` went with it — it was a grid property on a flex box. */
        <div className="grid">
          {courses.map((c) => (
            <CourseCard key={c.id} course={toSummary(c)} fill />
          ))}
        </div>
      ) : (
        <div className="dark-panel title-list">
          {courses.map((c, i) => (
            <TitleRow key={c.id} course={c} index={i + 1} />
          ))}
          {courses.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🎓</div>
              <p>No courses match — try a different filter.</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function toSummary(c: EntityCourse) {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    description: c.description,
    thumbnailUrl: c.thumbnailUrl,
    level: c.level,
    durationMin: c.durationMin,
    ratingAvg: c.ratingAvg,
    ratingCount: c.ratingCount,
    downloadCount: c.downloadCount,
    lessonCount: 0,
    isPremium: false,
    isFeatured: false,
    contentType: "course",
    categoryNames: [],
    lecturerName: null,
    lecturerNames: [],
    organizationName: null,
    publishedAt: c.publishedAt ?? "",
  };
}
