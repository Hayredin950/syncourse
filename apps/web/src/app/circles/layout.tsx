import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Study circles — Syncourse",
  description: "Learn alongside other people: open circles, discussion and shared progress on Syncourse.",
  alternates: { canonical: "/circles" },
};

export default function CirclesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
