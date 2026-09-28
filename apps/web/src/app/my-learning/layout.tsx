import type { Metadata } from "next";

/** Signed-in surface — robots.txt disallows it, and this keeps it out of an
 *  index even if a crawler already knows the URL. */
export const metadata: Metadata = {
  title: "My learning — Syncourse",
  robots: { index: false, follow: false },
};

export default function MyLearningLayout({ children }: { children: React.ReactNode }) {
  return children;
}
