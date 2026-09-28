import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Syncourse Premium — every course, offline and on Telegram",
  description:
    "Syncourse Premium unlocks every course and download, offline viewing in the mobile app, and file delivery through the Telegram bot. Plans from one month.",
  alternates: { canonical: "/premium" },
};

export default function PremiumLayout({ children }: { children: React.ReactNode }) {
  return children;
}
