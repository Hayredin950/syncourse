import OrganizationPage from "./page-client";

// Static export: real organization URLs are served at runtime via the SPA fallback (_redirects).
export async function generateStaticParams() {
  return [{ slug: "organization" }];
}

export default function OrganizationRoute() {
  return <OrganizationPage />;
}
