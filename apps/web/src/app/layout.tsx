import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { TopNav, Footer, BottomNav } from "@/components/Nav";

export const metadata: Metadata = {
  metadataBase: new URL("https://syncourse.pages.dev"),
  title: "Syncourse — Discover Courses & Learn",
  description:
    "Discover, track, and enjoy courses, mini-courses, cheat-sheets and roadmaps. Browse trending content, manage your learning, and explore by category on Syncourse.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "Syncourse — Learn anything, stay in sync.",
    description:
      "Watch anywhere, learn offline, track progress. Courses, mini-courses, cheat-sheets and roadmaps.",
    images: [{ url: "/social-preview.png", width: 1731, height: 909, alt: "Syncourse — Learn anything, stay in sync." }],
    siteName: "Syncourse",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Syncourse — Learn anything, stay in sync.",
    description: "Watch anywhere, learn offline, track progress.",
    images: ["/social-preview.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="site-shell">
            <TopNav />
            {children}
            <Footer />
            <BottomNav />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
