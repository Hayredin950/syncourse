import ResourcePageClient from "./page-client";
import { resourceSlugs } from "@/lib/static-params";

// One exported file per real slug, so a shared link resolves without the SPA
// fallback. Anything published after the build is caught by not-found.tsx.
export async function generateStaticParams() {
  return resourceSlugs();
}

export default function ResourcePage() {
  return <ResourcePageClient />;
}
