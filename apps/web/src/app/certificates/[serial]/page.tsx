import type { Metadata } from "next";
import CertificatePage from "./page-client";

/**
 * Certificates are created after a reader finishes a course, so there is no
 * build-time list. The placeholder keeps the route valid in static export;
 * the client fetch resolves the real serial at runtime.
 */
export async function generateStaticParams() {
  return [{ serial: "SYN-0000-0000" }];
}

export const metadata: Metadata = {
  title: "Certificate — Syncourse",
  description: "Verify a Syncourse certificate of completion.",
  robots: { index: false, follow: false },
};

export default function CertificateRoute() {
  return <CertificatePage />;
}
