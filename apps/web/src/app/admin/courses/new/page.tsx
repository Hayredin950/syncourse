"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CourseForm } from "@/components/admin/CourseForm";

/** The admin layout already gates on a staff session, so this page only frames
 *  the form. */
export default function NewCoursePage() {
  return (
    <div>
      <Link href="/admin/courses" className="admin-back">
        <ArrowLeft size={13} /> Courses
      </Link>
      <div className="admin-page-head">
        <div>
          <h1>New course</h1>
          <p className="page-desc">
            Title and description are required. Everything else can be filled in later from the edit screen.
          </p>
        </div>
      </div>
      <CourseForm />
    </div>
  );
}
