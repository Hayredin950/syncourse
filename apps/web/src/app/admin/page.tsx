"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { del, get } from "@/lib/api";
import type { AdminCourseRow } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export default function AdminPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<AdminCourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (token && !user) return; // auth still resolving
    if (!token || !user?.isStaff) return;
    get<AdminCourseRow[]>("/admin/courses")
      .then(setCourses)
      .catch(() => setToast("Failed to load courses"))
      .finally(() => setLoading(false));
  }, [token, user]);

  if (!token) {
    return (
      <div className="p-4 text-center text-sm text-muted">
        <Link href="/auth?next=/admin" className="font-medium text-accent">Sign in</Link> to access the admin panel.
      </div>
    );
  }
  if (user && !user.isStaff) {
    return <div className="p-4 text-center text-sm text-muted">Admin access is limited to staff accounts.</div>;
  }
  if (loading) {
    return <div className="p-4 text-center text-sm text-muted">Loading…</div>;
  }

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

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-dim">Admin</div>
          <h1 className="text-lg font-bold text-text">Courses · {courses.length}</h1>
        </div>
        <Link href="/admin/courses/new" className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-black">
          + New course
        </Link>
      </div>

      <div className="divide-y divide-border">
        {courses.length === 0 && <div className="p-6 text-center text-sm text-dim">No courses yet — create your first one.</div>}
        {courses.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-surface">
              {c.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`line-clamp-1 text-sm font-medium ${c.deleted ? "text-dim line-through" : "text-text"}`}>
                  {c.title}
                </span>
                {c.deleted && <span className="rounded bg-danger/20 px-1 text-[9px] font-bold text-danger">DELETED</span>}
                {c.isPremium && <span className="rounded bg-accent px-1 text-[9px] font-bold text-black">PREMIUM</span>}
              </div>
              <div className="mt-0.5 text-[11px] text-dim">
                {c.contentType} · {c.sectionCount} sections · ★ {c.ratingAvg.toFixed(1)} · {c.enrollmentCount.toLocaleString()} students
                {c.level ? ` · ${c.level}` : ""} · {formatDate(c.updatedAt)}
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Link href={`/admin/courses/${c.slug}/edit`} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-text">
                Edit
              </Link>
              {!c.deleted && (
                <button onClick={() => remove(c.slug)} className="rounded-full border border-danger/40 px-3 py-1 text-xs text-danger hover:bg-danger/10">
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-fit rounded-full bg-surface-raised px-4 py-2 text-xs text-text shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
