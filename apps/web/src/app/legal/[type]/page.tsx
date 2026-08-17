import LegalPageClient from "./page-client";

export async function generateStaticParams() {
  return [{ type: "terms" }, { type: "privacy" }, { type: "refund" }];
}

export default function LegalPage() {
  return <LegalPageClient />;
}
