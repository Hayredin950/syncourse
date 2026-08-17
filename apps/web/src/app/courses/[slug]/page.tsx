import CoursePageClient from "./page-client";

// Static export: real slugs are served at runtime via the SPA fallback (_redirects).
export async function generateStaticParams() {
  return [{ slug: "course" }];
}

export default function CoursePage() {
  return <CoursePageClient />;
}
