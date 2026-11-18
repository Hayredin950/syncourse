import type { Metadata } from "next";
import LessonPageClient from "./page-client";
import { lessonParams } from "@/lib/static-params";
import { canonicalUrl, fetchMeta, shareMetadata, summarise } from "@/lib/page-meta";

// Every real lesson is exported so deep links and client navigation resolve.
export async function generateStaticParams() {
  return lessonParams();
}

interface CourseWithLessons {
  title?: string;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
  sections?: { lessons?: { id: string; title?: string; summary?: string | null }[] }[];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}): Promise<Metadata> {
  const { slug, lessonId } = await params;
  const course = await fetchMeta<CourseWithLessons>(`/courses/${slug}`);
  const lesson = course?.sections?.flatMap((s) => s.lessons ?? []).find((l) => l.id === lessonId);
  if (!course?.title || !lesson) return {};
  const title = lesson.title ? `${lesson.title} — ${course.title}` : course.title;
  const description = summarise(lesson.summary) ?? `A lesson from ${course.title} on Syncourse.`;
  const url = canonicalUrl(`/courses/${slug}/lessons/${lessonId}`);
  return {
    title: `${title} — Syncourse`,
    description,
    alternates: { canonical: url },
    ...shareMetadata({
      title,
      description,
      url,
      // A lesson has no picture of its own; the course it belongs to does.
      image: course.bannerUrl ?? course.thumbnailUrl,
      imageAlt: `${course.title} — course on Syncourse`,
      type: "article",
    }),
  };
}

export default function LessonPage() {
  return <LessonPageClient />;
}
