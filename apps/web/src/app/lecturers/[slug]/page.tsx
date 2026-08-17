import LecturerPage from "./page-client";

// Static export: real lecturer URLs are served at runtime via the SPA fallback (_redirects).
export async function generateStaticParams() {
  return [{ slug: "lecturer" }];
}

export default function LecturerRoute() {
  return <LecturerPage />;
}
