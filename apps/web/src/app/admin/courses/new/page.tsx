"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { CourseForm } from "@/components/admin/CourseForm";

export default function NewCoursePage() {
  const { user, token } = useAuth();

  if (!token) {
    return (
      <div className="p-4 text-center text-sm text-muted">
        <Link href="/auth?next=/admin/courses/new" className="font-medium text-accent">Sign in</Link> to access the admin panel.
      </div>
    );
  }
  if (user && !user.isStaff) {
    return <div className="p-4 text-center text-sm text-muted">Admin access is limited to staff accounts.</div>;
  }

  return (
    <div>
      <div className="border-b border-border px-4 py-3">
        <Link href="/admin" className="text-xs font-medium text-accent">← Admin</Link>
        <h1 className="mt-0.5 text-lg font-bold text-text">New course</h1>
      </div>
      <CourseForm />
    </div>
  );
}
