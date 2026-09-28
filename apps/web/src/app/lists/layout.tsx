import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Collections — Syncourse",
  description: "Curated collections of courses and resources, saved and shared by the Syncourse community.",
  alternates: { canonical: "/lists" },
};

export default function ListsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
