import type { Metadata } from "next";
import PathDetailPage from "./page-client";
import { pathIds } from "@/lib/static-params";
import { canonicalUrl, fetchMeta, summarise } from "@/lib/page-meta";

// Every real path id is exported so deep links and client navigation resolve.
export async function generateStaticParams() {
  return pathIds();
}

interface PathMeta {
  title?: string;
  name?: string;
  description?: string | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const path = await fetchMeta<PathMeta>(`/learning-paths/${id}`);
  const title = path?.title ?? path?.name;
  // The placeholder id from static-params has no row behind it — fall back to
  // the section's own title rather than inventing a name for a 404.
  if (!title) return { title: "Learning paths — Syncourse" };
  const description = summarise(path?.description);
  const url = canonicalUrl(`/paths/${id}`);
  return {
    title: `${title} — Syncourse`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
  };
}

export default function PathRoute() {
  return <PathDetailPage />;
}
