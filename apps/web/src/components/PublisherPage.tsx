"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { get } from "@/lib/api";
import type { OrganizationDetail } from "@/lib/types";
import { compact } from "@/lib/format";
import { CourseCard } from "@/components/CourseCard";
import { CoverImage } from "@/components/CoverImage";
import { MobileHeader } from "@/components/Nav";
import { ShareButton } from "@/components/ShareButton";
import { SkEntityPage } from "@/components/Skeleton";
import { TitleRow, TitleToolbar, type EntityCourse, type SortMode, type ViewMode } from "@/components/TitleList";

/**
 * `slug` is optional only so the smart 404 can render this view for a channel
 * created since the last build: inside `not-found.tsx` there is no dynamic
 * route, so `useParams` comes back empty.
 */
export default function PublisherPage({
  backHref = "/",
  slug: slugProp,
}: {
  backHref?: string;
  slug?: string;
}) {
  const params = useParams<{ slug: string }>();
  const slug = slugProp ?? params?.slug ?? "";
  const [o, setO] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<SortMode>("top");
  const [view, setView] = useState<ViewMode>("list");
  const [filterQ, setFilterQ] = useState("");

  useEffect(() => {
    if (!slug) return;
    get<OrganizationDetail>(`/organizations/${slug}`)
      .then(setO)
      .catch(() => setError(true));
  }, [slug]);

  const courses = useMemo(() => {
    if (!o) return [];
    let list = [...o.courses] as EntityCourse[];
    if (filterQ.trim()) {
      const q = filterQ.toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q));
    }
    if (sort === "top") list.sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount);
    if (sort === "newest") list.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
    if (sort === "az") list.sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [o, sort, filterQ]);

  if (error) {
    return (
      <main className="page">
        <MobileHeader title="Publisher" />
        <div className="empty-state" style={{ padding: "48px 24px" }}>
          <div className="empty-icon">🔎</div>
          <h3 style={{ margin: "0 0 6px" }}>We can&apos;t find that channel</h3>
          <p>The page may have moved, or the name may have changed.</p>
          <Link href="/organizations" className="btn" style={{ marginTop: 18 }}>All channels &amp; schools</Link>
        </div>
      </main>
    );
  }

  if (!o) {
    return (
      <main className="page">
        <MobileHeader title="Publisher" />
        <SkEntityPage label="Loading the channel" />
      </main>
    );
  }

  const typeLabel = o.orgType === "university" ? "University" : o.orgType === "company" ? "Company" : "Publisher";

  return (
    <main className="page">
      <MobileHeader title={o.name} />

      <Link href={backHref} className="back-btn">
        <ArrowLeft size={14} /> Back
      </Link>

      <div className="profile-head" style={{ paddingTop: 18 }}>
        <div className="profile-row">
          <div className="avatar">
            {/* Initial always, logo over it — see CoverImage. */}
            {o.name.charAt(0)}
            <CoverImage src={o.logoUrl} transform={{ width: 160, height: 160 }} alt={o.name} eager />
          </div>
          <div>
            <span className="eyebrow">Publisher</span>
            <h1 className="display" style={{ fontSize: 39, margin: "8px 0 10px" }}>{o.name}</h1>
            <p className="muted" style={{ margin: 0 }}>
              <span className="badge" style={{ textTransform: "uppercase", letterSpacing: ".08em" }}>{typeLabel}</span>
              <span style={{ marginLeft: 10 }}>· {compact(o.subscribers)} learners · {o.courses.length} courses</span>
            </p>
          </div>
        </div>
        <ShareButton title={`${o.name} on Syncourse`} label="Share channel" />
      </div>

      {o.description && (
        <p className="muted" style={{ maxWidth: 700, lineHeight: 1.7, marginTop: 24 }}>{o.description}</p>
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
              <div className="empty-icon">📚</div>
              <p>No titles match — try a different filter.</p>
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
    contentType: c.contentType ?? "course",
    categoryNames: [],
    lecturerName: null,
    lecturerNames: [],
    organizationName: null,
    publishedAt: c.publishedAt ?? "",
  };
}
