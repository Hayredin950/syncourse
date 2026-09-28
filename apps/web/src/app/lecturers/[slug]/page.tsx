import type { Metadata } from "next";
import LecturerPage from "./page-client";
import { lecturerSlugs } from "@/lib/static-params";
import { canonicalUrl, fetchMeta, summarise } from "@/lib/page-meta";

// Every real lecturer slug is exported so deep links and client navigation resolve.
export async function generateStaticParams() {
  return lecturerSlugs();
}

interface LecturerMeta {
  name?: string;
  bio?: string | null;
  photoUrl?: string | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lecturer = await fetchMeta<LecturerMeta>(`/lecturers/${slug}`);
  if (!lecturer?.name) return {};
  const description = summarise(lecturer.bio) ?? `Courses by ${lecturer.name} on Syncourse.`;
  const url = canonicalUrl(`/lecturers/${slug}`);
  return {
    title: `${lecturer.name} — Syncourse`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${lecturer.name} — Syncourse`,
      description,
      url,
      images: lecturer.photoUrl ? [{ url: lecturer.photoUrl }] : undefined,
    },
  };
}

export default function LecturerRoute() {
  return <LecturerPage />;
}
