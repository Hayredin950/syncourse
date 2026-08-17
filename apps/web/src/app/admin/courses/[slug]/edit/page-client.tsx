"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { del, get } from "@/lib/api";
import type { AdminCourseDetail } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { CourseForm } from "@/components/admin/CourseForm";

export default function EditCoursePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, token } = useAuth();
  const [course, setCourse] = useState<AdminCourseDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token || !user?.isStaff) return;
    get<AdminCourseDetail>(`/admin/courses/${slug}`)
      .then(setCourse)
      .catch(() => setError(true));
  }, [slug, token, user]);

  if (!token) {
    return (
      <div className="p-4 text-center text-sm text-muted">
        <Link href={`/auth?next=/admin/courses/${slug}/edit`} className="font-medium text-accent">Sign in</Link> to access the admin panel.
      </div>
    );
  }
  if (user && !user.isStaff) {
    return <div className="p-4 text-center text-sm text-muted">Admin access is limited to staff accounts.</div>;
  }
  if (error) {
    return <div className="p-4 text-center text-sm text-muted">Course not found.</div>;
  }
  if (!course) {
    return <div className="p-4 text-center text-sm text-muted">Loading…</div>;
  }

  const remove = async () => {
    if (!confirm("Delete this course? Students' progress history is kept (soft delete).")) return;
    try {
      await del(`/admin/courses/${slug}`);
      router.push("/admin");
    } catch {
      /* toast handled by form flow */
    }
  };

  return (
    <div>
      <div className="border-b border-border px-4 py-3">
        <Link href="/admin" className="text-xs font-medium text-accent">← Admin</Link>
        <div className="mt-0.5 flex items-center justify-between">
          <h1 className="text-lg font-bold text-text">Edit course</h1>
          <button onClick={remove} className="rounded-full border border-danger/40 px-3 py-1 text-xs text-danger hover:bg-danger/10">
            Delete course
          </button>
        </div>
        <div className="mt-0.5 text-xs text-dim">/{course.slug}</div>
      </div>
      <CourseForm initial={course} />
    </div>
  );
}
