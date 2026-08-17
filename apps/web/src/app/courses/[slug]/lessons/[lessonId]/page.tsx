import LessonPageClient from "./page-client";
import { lessonParams } from "@/lib/static-params";

// Every real lesson is exported so deep links and client navigation resolve.
export async function generateStaticParams() {
  return lessonParams();
}

export default function LessonPage() {
  return <LessonPageClient />;
}
