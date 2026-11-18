import type { Metadata } from "next";
import CoursePageClient from "./page-client";
import { courseSlugs } from "@/lib/static-params";
import { canonicalUrl, fetchMeta, shareMetadata, summarise } from "@/lib/page-meta";

// Every real course slug is exported so deep links and client navigation resolve.
export async function generateStaticParams() {
  return courseSlugs();
}

interface CourseMeta {
  title?: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
}

/**
 * Course pages were all serving the layout's single title and description, so
 * every course looked identical to a crawler and to anyone sharing a link.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = await fetchMeta<CourseMeta>(`/courses/${slug}`);
  if (!course?.title) return {};
  const description = summarise(course.description);
  const url = canonicalUrl(`/courses/${slug}`);
  return {
    title: `${course.title} — Syncourse`,
    description,
    alternates: { canonical: url },
    ...shareMetadata({
      title: course.title,
      description,
      url,
      image: course.bannerUrl ?? course.thumbnailUrl,
      imageAlt: `${course.title} — course on Syncourse`,
      type: "article",
    }),
  };
}

export default function CoursePage() {
  return <CoursePageClient />;
}
