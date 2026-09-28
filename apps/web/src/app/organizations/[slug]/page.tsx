import type { Metadata } from "next";
import OrganizationPage from "./page-client";
import { organizationSlugs } from "@/lib/static-params";
import { canonicalUrl, fetchMeta, summarise } from "@/lib/page-meta";

// Every real organization slug is exported so deep links and client navigation resolve.
export async function generateStaticParams() {
  return organizationSlugs();
}

interface OrganizationMeta {
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
  const org = await fetchMeta<OrganizationMeta>(`/organizations/${slug}`);
  if (!org?.name) return {};
  const description = summarise(org.description) ?? `Courses from ${org.name} on Syncourse.`;
  const url = canonicalUrl(`/organizations/${slug}`);
  return {
    title: `${org.name} — Syncourse`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${org.name} — Syncourse`,
      description,
      url,
      images: org.logoUrl ? [{ url: org.logoUrl }] : undefined,
    },
  };
}

export default function OrganizationRoute() {
  return <OrganizationPage />;
}
