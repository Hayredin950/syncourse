import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Organizations and publishers — Syncourse",
  description:
    "Universities, companies and publishers behind the Syncourse catalogue, with their full course lists.",
  alternates: { canonical: "/organizations" },
};

export default function OrganizationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
