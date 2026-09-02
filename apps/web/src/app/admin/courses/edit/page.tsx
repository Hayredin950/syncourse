"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { get } from "@/lib/api";
import type { AdminCourseDetail } from "@/lib/types";
import { CourseForm } from "@/components/admin/CourseForm";

/**
 * Editing shell. Deleting lives on the course detail page, in its own danger
 * zone — a destructive button sitting next to Save is how courses get deleted
 * by accident.
 *
 * `?slug=` rather than a dynamic segment: with `output: export` the route only
 * exists for slugs known at build time, so a course added afterwards could not
 * be edited until the next deploy.
 */
export default function EditCoursePage() {
  return (
    <Suspense fallback={<span className="admin-skeleton" style={{ height: 220, display: "block" }} />}>
      <EditCourse />
    </Suspense>
  );
}

function EditCourse() {
  const slug = useSearchParams().get("slug") ?? "";
  const [course, setCourse] = useState<AdminCourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setError("No course selected.");
      return;
    }
    get<AdminCourseDetail>(`/admin/courses/${slug}`)
      .then(setCourse)
      .catch((e) => setError(e instanceof Error ? e.message : "Course not found"));
  }, [slug]);

  return (
    <div>
      <Link href={`/admin/courses/detail?slug=${slug}`} className="admin-back">
        <ArrowLeft size={13} /> Course
      </Link>

      <div className="admin-page-head">
        <div>
          <h1>{course ? `Edit ${course.title}` : "Edit course"}</h1>
          <p className="page-desc">/{slug}</p>
        </div>
        {slug && (
          <div className="admin-page-head__actions">
            <Link href={`/courses/${slug}`} className="admin-btn admin-btn--ghost">
              <ExternalLink size={13} /> View on site
            </Link>
          </div>
        )}
      </div>

      {error && <p className="admin-empty">{error}</p>}
      {!error && !course && (
        <div className="admin-stack">
          <span className="admin-skeleton" style={{ height: 140, display: "block" }} />
          <span className="admin-skeleton" style={{ height: 200, display: "block" }} />
        </div>
      )}
      {course && <CourseForm initial={course} />}
    </div>
  );
}
