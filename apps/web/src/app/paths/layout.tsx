import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learning paths — Syncourse",
  description:
    "Curated courses in order, so you can go from first principles to job-ready without guessing what to study next.",
  alternates: { canonical: "/paths" },
};

export default function PathsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
