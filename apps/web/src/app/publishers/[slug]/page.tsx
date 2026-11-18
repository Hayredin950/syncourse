import type { Metadata } from "next";
import PublisherSlugPage from "./page-client";
import { organizationSlugs } from "@/lib/static-params";
import { canonicalUrl, fetchMeta, shareMetadata, summarise } from "@/lib/page-meta";

// Publisher pages resolve to the same organizations catalog — every real
// slug is exported so deep links and client navigation work.
export async function generateStaticParams() {
  return organizationSlugs();
}

interface PublisherMeta {
  name?: string;
  description?: string | null;
  logoUrl?: string | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const publisher = await fetchMeta<PublisherMeta>(`/organizations/${slug}`);
  if (!publisher?.name) return {};
  const description = summarise(publisher.description) ?? `Courses from ${publisher.name} on Syncourse.`;
  const url = canonicalUrl(`/publishers/${slug}`);
  const title = `${publisher.name} — Syncourse`;
  return {
    title,
    description,
    alternates: { canonical: url },
    ...shareMetadata({
      title,
      description,
      url,
      image: publisher.logoUrl,
      imageAlt: `${publisher.name} on Syncourse`,
      type: "profile",
    }),
  };
}

export default function PublisherRoute() {
  return <PublisherSlugPage />;
}
