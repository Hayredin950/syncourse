import EditResourcePageClient from "./page-client";
import { resourceSlugs } from "@/lib/static-params";

// Admin edit routes key on the resource slug — export the real ones so both a
// deep link and client-side navigation resolve to a file that exists.
export async function generateStaticParams() {
  return resourceSlugs();
}

export default function EditResourcePage() {
  return <EditResourcePageClient />;
}
