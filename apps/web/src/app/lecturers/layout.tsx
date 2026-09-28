import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lecturers — Syncourse",
  description: "Learn from the people behind the courses: profiles, credentials and everything they teach.",
  alternates: { canonical: "/lecturers" },
};

export default function LecturersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
