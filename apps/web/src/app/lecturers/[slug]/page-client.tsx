"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { get } from "@/lib/api";
import type { LecturerDetail } from "@/lib/types";
import BackButton from "@/components/BackButton";
import { CourseCard } from "@/components/CourseCard";
import { CoverImage } from "@/components/CoverImage";
import { MobileHeader } from "@/components/Nav";
import { ShareButton } from "@/components/ShareButton";
import { SkEntityPage } from "@/components/Skeleton";
import { TitleRow, TitleToolbar, type EntityCourse, type SortMode, type ViewMode } from "@/components/TitleList";

/**
 * The lecturer page is driven by a slug prop so both the static route and the
 * smart 404 can render it — `useParams` is empty inside `not-found.tsx`, which
 * is why a lecturer created after the last build used to dead-end there.
 */
export default function LecturerPage({ slug: slugProp }: { slug?: string } = {}) {
  const params = useParams<{ slug: string }>();
  const slug = slugProp ?? params?.slug ?? "";
  const [l, setL] = useState<LecturerDetail | null>(null);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<SortMode>("top");
  const [view, setView] = useState<ViewMode>("list");
  const [filterQ, setFilterQ] = useState("");

  useEffect(() => {
    if (!slug) return;
    get<LecturerDetail>(`/lecturers/${slug}`)
      .then(setL)
      .catch(() => setError(true));
  }, [slug]);

  /* "Known for" is a shortcut, not a second copy of the catalogue: it only
     appears when there is a catalogue to skim, and it ranks by downloads rather
     than by the sort the Titles list below is using. With one or two courses the
     section and the list were the same two cards printed twice. */
  const knownFor = useMemo(() => {
    if (!l) return [];
    return [...l.courses].sort((a, b) => b.downloadCount - a.downloadCount || b.ratingCount - a.ratingCount).slice(0, 6);
  }, [l]);

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
        <BackButton fallback="/lecturers" />
        <SkEntityPage label="Loading the lecturer" />
      </main>
    );
  }

  return (
    <main className="page">
      <MobileHeader title="Lecturer" />

      <div style={{ marginBottom: 18 }}>
        <BackButton fallback="/lecturers" />
      </div>

      <div className="profile-head">
        <div className="profile-row">
          <div className="avatar">
            {/* Initial always, photo over it — see CoverImage. */}
            {l.name.charAt(0)}
            <CoverImage src={l.photoUrl} transform={{ width: 192, height: 192 }} alt={l.name} eager />
          </div>
          <div>
            <span className="eyebrow">Lecturer</span>
            <h1 className="display page-title" style={{ margin: "8px 0" }}>{l.name}</h1>
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

      {l.courses.length > 3 && (
        <section className="rail">
          <div className="section-head">
            <h2>Known for</h2>
            <span className="muted mono" style={{ fontSize: 10 }}>
              Most downloaded of {l.courses.length}
            </span>
          </div>
          <div className="rail-row">
            {knownFor.map((c) => (
              <CourseCard key={c.id} course={toSummary(c)} />
            ))}
          </div>
        </section>
      )}

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
    lessonCount: c.lessonCount ?? 0,
    isPremium: Boolean(c.isPremium),
    saved: Boolean(c.saved),
    isFeatured: false,
    contentType: "course",
    categoryNames: [],
    lecturerName: null,
    lecturerNames: [],
    organizationName: null,
    publishedAt: c.publishedAt ?? "",
  };
}
