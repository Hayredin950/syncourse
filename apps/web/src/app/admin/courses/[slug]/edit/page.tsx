import EditCoursePageClient from "./page-client";

// Static export: real course slugs are served at runtime via the SPA fallback (_redirects).
export async function generateStaticParams() {
  return [{ slug: "course" }];
}

export default function EditCoursePage() {
  return <EditCoursePageClient />;
}
