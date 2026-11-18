import type { Metadata } from "next";
import ResourcePageClient from "./page-client";
import { resourceSlugs } from "@/lib/static-params";
import { canonicalUrl, fetchMeta, shareMetadata, summarise } from "@/lib/page-meta";

// One exported file per real slug, so a shared link resolves without the SPA
// fallback. Anything published after the build is caught by not-found.tsx.
export async function generateStaticParams() {
  return resourceSlugs();
}

interface ResourceMeta {
  slug?: string;
  title?: string;
  summary?: string | null;
  coverUrl?: string | null;
}

/** There is no `/resources/:slug` endpoint — the list is the source of truth. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchMeta<{ results?: ResourceMeta[] }>("/resources?limit=100");
  const resource = data?.results?.find((r) => r?.slug === slug);
  if (!resource?.title) return {};
  const description = summarise(resource.summary);
  const url = canonicalUrl(`/resources/${slug}`);
  return {
    title: `${resource.title} — Syncourse`,
    description,
    alternates: { canonical: url },
    ...shareMetadata({
      title: resource.title,
      description,
      url,
      image: resource.coverUrl,
      imageAlt: `${resource.title} — resource on Syncourse`,
      type: "article",
    }),
  };
}

export default function ResourcePage() {
  return <ResourcePageClient />;
}
