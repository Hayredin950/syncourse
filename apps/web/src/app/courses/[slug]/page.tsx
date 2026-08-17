import CoursePageClient from "./page-client";
import { courseSlugs } from "@/lib/static-params";

// Every real course slug is exported so deep links and client navigation resolve.
export async function generateStaticParams() {
  return courseSlugs();
}

export default function CoursePage() {
  return <CoursePageClient />;
}
