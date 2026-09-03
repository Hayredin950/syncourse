"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { get } from "@/lib/api";
import type { OrganizationDetail } from "@/lib/types";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { compact } from "@/lib/format";
import { CourseCard } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";
import { TitleRow, TitleToolbar, type EntityCourse, type SortMode, type ViewMode } from "@/components/TitleList";

export default function PublisherPage({ backHref = "/" }: { backHref?: string }) {
  const { slug } = useParams<{ slug: string }>();
  const [o, setO] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<SortMode>("top");
  const [view, setView] = useState<ViewMode>("list");
  const [filterQ, setFilterQ] = useState("");

  useEffect(() => {
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

  if (error || !o) {
    return (
      <main className="page">
        <MobileHeader title="Publisher" />
        <div className="dark-panel" style={{ padding: 40, textAlign: "center" }}>
          <p className="muted">{error ? "Publisher not found" : "Loading…"}</p>
        </div>
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
            {o.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cloudinaryUrl(o.logoUrl, { width: 160, height: 160 }) ?? undefined} alt={o.name} className="h-full w-full rounded-[20px] object-cover" />
            ) : (
              o.name.charAt(0)
            )}
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
        <button className="btn"><Plus size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Follow</button>
      </div>

      {o.description && (
        <p className="muted" style={{ maxWidth: 700, lineHeight: 1.7, marginTop: 24 }}>{o.description}</p>
      )}

      <TitleToolbar total={courses.length} sort={sort} setSort={setSort} view={view} setView={setView} onFilter={setFilterQ} />

      {view === "grid" ? (
        <div className="rail-row" style={{ gridAutoColumns: "minmax(150px, 1fr)" }}>
          {courses.map((c) => (
            <CourseCard key={c.id} course={toSummary(c)} />
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
