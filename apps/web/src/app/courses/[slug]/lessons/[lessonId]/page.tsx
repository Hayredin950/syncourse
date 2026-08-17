import LessonPageClient from "./page-client";

// Static export: real lesson URLs are served at runtime via the SPA fallback (_redirects).
export async function generateStaticParams() {
  return [{ slug: "course", lessonId: "lesson" }];
}

export default function LessonPage() {
  return <LessonPageClient />;
}
