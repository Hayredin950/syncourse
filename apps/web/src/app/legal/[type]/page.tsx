import type { Metadata } from "next";
import LegalPageClient from "./page-client";
import { canonicalUrl } from "@/lib/page-meta";

export async function generateStaticParams() {
  return [{ type: "terms" }, { type: "privacy" }, { type: "refund" }];
}

/**
 * The body text comes from the API at request time; the title and description
 * are fixed, so they can be declared here without a fetch.
 */
const LEGAL: Record<string, { title: string; description: string }> = {
  terms: {
    title: "Terms & Conditions",
    description: "The terms you agree to when you use Syncourse — accounts, purchases, content and conduct.",
  },
  privacy: {
    title: "Privacy Policy",
    description: "What Syncourse collects, why, how long it is kept, and the choices you have over your data.",
  },
  refund: {
    title: "Refund Policy",
    description: "How refunds work for Syncourse Premium subscriptions and one-off purchases.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const doc = LEGAL[type];
  if (!doc) return {};
  const url = canonicalUrl(`/legal/${type}`);
  return {
    title: `${doc.title} — Syncourse`,
    description: doc.description,
    alternates: { canonical: url },
    openGraph: { title: doc.title, description: doc.description, url },
  };
}

export default function LegalPage() {
  return <LegalPageClient />;
}
