import EditCoursePageClient from "./page-client";
import { courseSlugs } from "@/lib/static-params";

// Admin edit routes use course slugs — export the real ones so navigation resolves.
export async function generateStaticParams() {
  return courseSlugs();
}

export default function EditCoursePage() {
  return <EditCoursePageClient />;
}
