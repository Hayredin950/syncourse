import type { Metadata } from "next";
import VerifyPage from "./verify-client";

export const metadata: Metadata = {
  title: "Verify a certificate — Syncourse",
  description: "Check a Syncourse certificate of completion by its serial number.",
};

export default function CertificateIndex() {
  return <VerifyPage />;
}
