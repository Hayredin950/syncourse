"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { del, get } from "@/lib/api";
import type { AdminCourseRow } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useToast } from "@/lib/useToast";

export default function AdminCourses() {
  const [courses, setCourses] = useState<AdminCourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast, setToast } = useToast();

  useEffect(() => {
    get<AdminCourseRow[]>("/admin/courses")
      .then(setCourses)
      .catch((e) => setToast(e.message))
      .finally(() => setLoading(false));
  }, [setToast]);

  const remove = async (slug: string) => {
    if (!confirm("Delete this course? Students' progress history is kept (soft delete).")) return;
    try {
      await del(`/admin/courses/${slug}`);
      setCourses((p) => p.filter((c) => c.slug !== slug));
      setToast("Course deleted");
    } catch (e: any) {
      setToast(e.message);
    }
  };

  if (loading) return <p className="page-desc">Loading…</p>;

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Courses</h1>
          <p className="page-desc">
            {courses.length} course(s) — everything visible on the site comes from here.
          </p>
        </div>
        <Link href="/admin/courses/new" className="admin-btn admin-btn--primary">
          + New course
        </Link>
      </div>

      <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>Title</th>
              <th>Type</th>
              <th>Sections</th>
              <th>Rating</th>
              <th>Students</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {courses.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.4)" }}>
                  No courses yet — create your first one.
                </td>
              </tr>
            )}
            {courses.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="h-12 w-9 overflow-hidden rounded bg-surface">
                    {c.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                </td>
                <td style={{ maxWidth: 320 }}>
                  <div style={{ fontWeight: 600, color: "#fff" }} className={c.deleted ? "line-through" : ""}>
                    {c.title}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                    {c.lecturer ?? "—"} · {c.organization ?? "—"}
                  </div>
                </td>
                <td>
                  <span className="admin-badge admin-badge--gray">{c.contentType}</span>
                  {c.isPremium && <span className="admin-badge admin-badge--accent" style={{ marginLeft: 4 }}>PREMIUM</span>}
                  {c.deleted && <span className="admin-badge admin-badge--red" style={{ marginLeft: 4 }}>DELETED</span>}
                </td>
                <td>{c.sectionCount}</td>
                <td>{c.ratingAvg.toFixed(1)}</td>
                <td>{c.enrollmentCount.toLocaleString()}</td>
                <td style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{formatDate(c.updatedAt)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Link href={`/admin/courses/${c.slug}/edit`} className="admin-btn admin-btn--ghost" style={{ marginRight: 6 }}>
                    Edit
                  </Link>
                  {!c.deleted && (
                    <button onClick={() => remove(c.slug)} className="admin-btn admin-btn--danger">
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && <AdminToast text={toast} />}
    </div>
  );
}

export function AdminToast({ text }: { text: string }) {
  return (
    <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-fit rounded-full bg-surface-raised px-4 py-2 text-xs text-text shadow-lg">
      {text}
    </div>
  );
}
