import type { Metadata } from "next";

/** Search result pages are per-query and add nothing to an index. */
export const metadata: Metadata = {
  title: "Search — Syncourse",
  description: "Search the Syncourse catalogue of courses, resources, lecturers and organizations.",
  robots: { index: false, follow: true },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
