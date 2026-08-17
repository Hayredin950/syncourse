import PublisherSlugPage from "./page-client";
import { organizationSlugs } from "@/lib/static-params";

// Publisher pages resolve to the same organizations catalog — every real
// slug is exported so deep links and client navigation work.
export async function generateStaticParams() {
  return organizationSlugs();
}

export default function PublisherRoute() {
  return <PublisherSlugPage />;
}
