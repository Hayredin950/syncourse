import type { Metadata } from "next";
import ListDetailPageClient from "./page-client";
import { listIds } from "@/lib/static-params";
import { canonicalUrl, fetchMeta, summarise } from "@/lib/page-meta";

// Every real list id is exported so deep links and client navigation resolve.
export async function generateStaticParams() {
  return listIds();
}

interface ListMeta {
  name?: string;
  description?: string | null;
  ownerName?: string | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const list = await fetchMeta<ListMeta>(`/lists/${id}`);
  // The placeholder id from static-params has no row behind it.
  if (!list?.name) return { title: "Collections — Syncourse" };
  const description =
    summarise(list.description) ??
    (list.ownerName ? `${list.ownerName} keeps this collection on Syncourse.` : undefined);
  const url = canonicalUrl(`/lists/${id}`);
  return {
    title: `${list.name} — Syncourse`,
    description,
    alternates: { canonical: url },
    openGraph: { title: list.name, description, url },
  };
}

export default function ListDetailPage() {
  return <ListDetailPageClient />;
}
