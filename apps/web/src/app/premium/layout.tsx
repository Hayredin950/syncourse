import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Syncourse Premium — every premium course, resource and download",
  description:
    "Syncourse Premium unlocks every premium course and resource, lesson files and downloads, and file delivery through the Telegram bot. Plans from one month.",
  alternates: { canonical: "/premium" },
};

export default function PremiumLayout({ children }: { children: React.ReactNode }) {
  return children;
}
