import OrganizationPage from "./page-client";
import { organizationSlugs } from "@/lib/static-params";

// Every real organization slug is exported so deep links and client navigation resolve.
export async function generateStaticParams() {
  return organizationSlugs();
}

export default function OrganizationRoute() {
  return <OrganizationPage />;
}
