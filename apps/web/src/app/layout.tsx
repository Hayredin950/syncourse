import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { TopNav, Footer, BottomNav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Syncourse — Discover Courses & Learn",
  description:
    "Discover, track, and enjoy courses, mini-courses, cheat-sheets and roadmaps. Browse trending content, manage your learning, and explore by category on Syncourse.",
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
