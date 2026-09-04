"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  Layers,
  Pencil,
  Star,
} from "lucide-react";
import { del, get } from "@/lib/api";
import type { AdminCourseDetail, AdminCourseRow, AdminReviewRow } from "@/lib/types";
import { formatDate, plural } from "@/lib/format";
import { relativeTime } from "@/lib/metrics";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminEmpty from "@/components/admin/AdminEmpty";
import ConfirmButton from "@/components/admin/ConfirmButton";
import CourseFilesPanel from "@/components/admin/CourseFilesPanel";
import ExpandableText from "@/components/admin/ExpandableText";

/**
 * Course drill-down — the read-only counterpart to the edit form.
 *
 * ?slug= rather than a dynamic segment, for the same reason as the user page:
 * the site is a static export. Curriculum and metadata come from the real
 * per-course endpoint; the engagement numbers and the deleted flag live on the
 * list row, so both are fetched and merged.
 */
export default function AdminCourseDetailPage() {
  return (
    <Suspense fallback={<div className="admin-skeleton" style={{ height: 220, display: "block" }} />}>
      <CourseDetail />
    </Suspense>
  );
}

function CourseDetail() {
  const slug = useSearchParams().get("slug");
  const router = useRouter();
  const toast = useAdminToast();
  const [course, setCourse] = useState<AdminCourseDetail | null>(null);
  const [row, setRow] = useState<AdminCourseRow | null>(null);
  const [reviews, setReviews] = useState<AdminReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!slug) return;
    // Cleared up front so a successful retry leaves the error branch, which
    // renders on a truthy `error` and would otherwise outlive the failure.
    setError(null);
    get<AdminCourseDetail>(`/admin/courses/${slug}`)
      .then(setCourse)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load that course"));
    get<AdminCourseRow[]>("/admin/courses")
      .then((rows) => setRow(rows.find((c) => c.slug === slug) ?? null))
      .catch(() => {});
    get<AdminReviewRow[]>("/admin/reviews").then(setReviews).catch(() => {});
  }, [slug]);

  useEffect(load, [load]);

  const mine = useMemo(() => reviews.filter((r) => r.course.slug === slug), [reviews, slug]);

  const lessons = useMemo(
    () => (course?.sections ?? []).reduce((a, s) => a + s.lessons.length, 0),
    [course],
  );

  const remove = async () => {
    if (!slug) return;
    setBusy(true);
    try {
      await del(`/admin/courses/${slug}`);
      toast.success("Course deleted — student progress is kept");
      router.push("/admin/courses");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that course");
      setBusy(false);
    }
  };

  if (!slug) {
    return (
      <div>
        <Link href="/admin/courses" className="admin-back">
          <ArrowLeft size={13} /> Courses
        </Link>
        <div className="admin-card">
          <AdminEmpty
            icon={<BookOpen size={18} />}
            title="No course was specified"
            hint="This page needs a course slug. Open one from the courses list."
            action={{ label: "Browse courses", href: "/admin/courses" }}
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Link href="/admin/courses" className="admin-back">
          <ArrowLeft size={13} /> Courses
        </Link>
        <div className="admin-card">
          <AdminEmpty
            icon={<AlertTriangle size={18} />}
            title="Could not load that course"
            hint={error}
            action={{ label: "Try again", onClick: load }}
          />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div>
        <Link href="/admin/courses" className="admin-back">
          <ArrowLeft size={13} /> Courses
        </Link>
        <div className="admin-stack">
          <span className="admin-skeleton" style={{ height: 46, width: 320, display: "block" }} />
          <span className="admin-skeleton" style={{ height: 180, display: "block" }} />
        </div>
      </div>
    );
  }

  const price = course.price ?? course.originalPrice;

  return (
    <div>
      <Link href="/admin/courses" className="admin-back">
        <ArrowLeft size={13} /> Courses
      </Link>

      <div className="admin-page-head">
        <div className="admin-detail-head">
          <span className="admin-thumb" style={{ width: 44, height: 58 }}>
            {course.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={course.thumbnailUrl} alt="" />
            ) : null}
          </span>
          <div>
            <h1 className={row?.deleted ? "admin-strike" : undefined}>{course.title}</h1>
            <p className="page-desc">
              {course.lecturerNames?.join(", ") || course.lecturerName || "No lecturer"} ·{" "}
              {course.organizationName ?? "No publisher"} · {course.levelName ?? "No level"}
            </p>
            <div className="admin-inline" style={{ gap: 5, marginTop: 6 }}>
              <span className="admin-badge admin-badge--gray">{course.contentType}</span>
              {course.isPremium && <span className="admin-badge admin-badge--violet">Premium</span>}
              {course.isFeatured && <span className="admin-badge admin-badge--blue">Featured</span>}
              {row?.deleted && <span className="admin-badge admin-badge--red">Deleted</span>}
            </div>
          </div>
        </div>
        <div className="admin-page-head__actions">
          <Link href={`/courses/${course.slug}`} className="admin-btn admin-btn--ghost">
            <ExternalLink size={13} /> View on site
          </Link>
          <Link href={`/admin/courses/edit?slug=${course.slug}`} className="admin-btn admin-btn--primary">
            <Pencil size={13} /> Edit
          </Link>
        </div>
      </div>

      <div className="admin-minitiles" style={{ marginBottom: 14 }}>
        <div className="admin-minitile">
          <strong>{(row?.downloadCount ?? 0).toLocaleString("en-US")}</strong>
          <span>
            <Download size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
            Downloads
          </span>
        </div>
        <div className="admin-minitile">
          <strong>{row ? row.ratingAvg.toFixed(1) : "—"}</strong>
          <span>
            <Star size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
            Average rating
          </span>
        </div>
        <div className="admin-minitile">
          <strong>{lessons.toLocaleString("en-US")}</strong>
          <span>
            <Layers size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
            Lessons in {plural(course.sections.length, "section")}
          </span>
        </div>
      </div>

      <div className="admin-detail-grid">
        <div className="admin-stack">
          <div className="admin-card">
            <h3>Description</h3>
            {course.description ? (
              <ExpandableText text={course.description} lines={5} />
            ) : (
              <AdminEmpty
                icon={<FileText size={18} />}
                title="No description written yet"
                hint="This is the first paragraph a student reads on the course page."
                action={{ label: "Write one", href: `/admin/courses/edit?slug=${course.slug}` }}
              />
            )}
          </div>

          <div className="admin-card admin-card--flush">
            <div className="admin-card__head">
              <h3>Curriculum</h3>
              <span className="admin-section-head__hint">
                {plural(course.sections.length, "section")} · {plural(lessons, "lesson")}
              </span>
            </div>
            {course.sections.length === 0 ? (
              <AdminEmpty
                icon={<Layers size={18} />}
                title="No sections yet"
                hint="The curriculum is what the course page lists as its contents — sections, then lessons inside them."
                action={{ label: "Add sections", href: `/admin/courses/edit?slug=${course.slug}` }}
              />
            ) : (
              <div>
                {course.sections.map((s, i) => (
                  <div key={s.id ?? i} className="admin-row admin-row--top">
                    <div className="admin-row__main">
                      <div className="admin-row__title">
                        {i + 1}. {s.title}
                      </div>
                      <div className="admin-row__meta">
                        {s.lessons.length === 0
                          ? "No lessons"
                          : s.lessons.map((l) => l.title).join(" · ")}
                      </div>
                    </div>
                    <div className="admin-row__actions">
                      <span className="admin-badge admin-badge--gray">
                        {plural(s.lessons.length, "lesson")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <CourseFilesPanel slug={course.slug} />

          <div className="admin-card admin-card--flush">
            <div className="admin-card__head">
              <h3>Reviews</h3>
              <Link href="/admin/reviews" className="admin-section-head__hint">
                Moderate all →
              </Link>
            </div>
            {mine.length === 0 ? (
              <AdminEmpty
                icon={<Star size={18} />}
                title="No reviews in the recent window"
                hint="This list is drawn from the 100 most recent reviews platform-wide, so an older course can rate well here and still show none."
              />
            ) : (
              <div>
                {mine.map((r) => (
                  <div key={r.id} className="admin-row admin-row--top">
                    <div className="admin-row__main">
                      <Link href={`/admin/users/detail?id=${r.author.id}`} className="admin-row__title">
                        {r.author.name}
                      </Link>
                      <ExpandableText text={r.body} className="admin-row__body" />
                      <div className="admin-row__meta">
                        {relativeTime(r.createdAt)} · {r.upvoteCount} upvotes · {r.replyCount} replies
                        {r.containsSpoilers && " · flagged spoilers"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="admin-stack">
          <div className="admin-card">
            <h3>Details</h3>
            <dl className="admin-kv">
              <dt>Slug</dt>
              <dd style={{ fontFamily: "var(--app-font-mono)", fontSize: 11 }}>{course.slug}</dd>
              <dt>Categories</dt>
              <dd>{course.categoryNames.length ? course.categoryNames.join(", ") : "—"}</dd>
              <dt>Language</dt>
              <dd>{course.language || "—"}</dd>
              <dt>Access</dt>
              <dd>
                {course.isPremium ? (
                  <span className="admin-badge admin-badge--violet">Premium only</span>
                ) : (
                  <span className="admin-status admin-status--idle">Free to all</span>
                )}
              </dd>
              <dt>Price</dt>
              <dd>
                {price == null
                  ? "—"
                  : course.price != null && course.originalPrice != null && course.price < course.originalPrice
                    ? `${course.price.toLocaleString("en-US")} (was ${course.originalPrice.toLocaleString("en-US")})`
                    : price.toLocaleString("en-US")}
              </dd>
              <dt>Cover image</dt>
              <dd>{course.thumbnailUrl ? "Set" : "Missing"}</dd>
              <dt>Preview video</dt>
              <dd>{course.previewVideoUrl ? "Set" : "—"}</dd>
              {row && (
                <>
                  <dt>Created</dt>
                  <dd>{formatDate(row.createdAt)}</dd>
                  <dt>Last updated</dt>
                  <dd>{formatDate(row.updatedAt)}</dd>
                </>
              )}
            </dl>
          </div>

          {(course.tags.length > 0 || course.audience.length > 0 || course.prerequisites) && (
            <div className="admin-card">
              <h3>Positioning</h3>
              <dl className="admin-kv">
                <dt>Tags</dt>
                <dd>{course.tags.length ? course.tags.join(", ") : "—"}</dd>
                <dt>Audience</dt>
                <dd>{course.audience.length ? course.audience.join(", ") : "—"}</dd>
                <dt>Prerequisites</dt>
                <dd>{course.prerequisites || "—"}</dd>
              </dl>
            </div>
          )}

          {!row?.deleted && (
            <div className="admin-card admin-danger-zone">
              <h3>Delete this course</h3>
              <p className="page-desc">
                This is a soft delete: the course disappears from the site, and every student&rsquo;s progress history
                is kept.
              </p>
              <ConfirmButton
                label="Delete course"
                question="Delete this course?"
                confirmLabel="Yes, delete"
                busy={busy}
                onConfirm={remove}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
