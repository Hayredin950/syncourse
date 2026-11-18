import type { Metadata } from "next";
import OrganizationPage from "./page-client";
import { organizationSlugs } from "@/lib/static-params";
import { canonicalUrl, fetchMeta, shareMetadata, summarise } from "@/lib/page-meta";

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
  const title = `${org.name} — Syncourse`;
  return {
    title,
    description,
    alternates: { canonical: url },
    ...shareMetadata({
      title,
      description,
      url,
      image: org.logoUrl,
      imageAlt: `${org.name} on Syncourse`,
      type: "profile",
    }),
  };
}

export default function OrganizationRoute() {
  return <OrganizationPage />;
}
