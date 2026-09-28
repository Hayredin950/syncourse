import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resources — cheat-sheets, roadmaps and notes — Syncourse",
  description:
    "Short, dense learning material: cheat-sheets, roadmaps, notes and walkthroughs you can read in a sitting.",
  alternates: { canonical: "/resources" },
};

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
