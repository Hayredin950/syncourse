import ListDetailPageClient from "./page-client";

// Static export: real list URLs are served at runtime via the SPA fallback (_redirects).
export async function generateStaticParams() {
  return [{ id: "public" }];
}

export default function ListDetailPage() {
  return <ListDetailPageClient />;
}
