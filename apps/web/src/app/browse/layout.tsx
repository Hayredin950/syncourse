import type { Metadata } from "next";

/**
 * `page.tsx` here is a client component, so it can't export metadata — these
 * route-level layouts are where the title and description for a public landing
 * page live. Without them every static page inherits the root layout's single
 * title, which is what crawlers and link previews were seeing.
 */
export const metadata: Metadata = {
  title: "Browse courses, cheat-sheets and roadmaps — Syncourse",
  description:
    "Explore the full Syncourse catalogue: courses, mini-courses, cheat-sheets and roadmaps across every category, filterable by level and topic.",
  alternates: { canonical: "/browse" },
};

export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
