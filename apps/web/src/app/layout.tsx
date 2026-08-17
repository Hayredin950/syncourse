import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { Sidebar } from "@/components/Sidebar";
import { RightRail } from "@/components/RightRail";

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
          <Nav />
          {/* Desktop shell: left nav rail · fluid main · right rail. Mobile keeps the top header + bottom nav. */}
          <div className="mx-auto flex w-full max-w-[1440px]">
            <Suspense fallback={null}>
              <Sidebar />
            </Suspense>
            <main className="min-h-screen min-w-0 flex-1 px-4 pb-20 md:px-6 lg:px-8 lg:pb-10">{children}</main>
            <RightRail />
          </div>
          <footer className="border-t border-border bg-bg">
            <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-1 px-4 py-6 text-center">
              <div className="text-xs text-muted lg:hidden">
                <span className="font-semibold text-text">GET THE APP</span> — Android · Android TV · Windows · macOS
              </div>
              <div className="flex gap-3 text-[11px] text-dim lg:hidden">
                <a href="/legal/terms" className="hover:text-muted">Terms of Service</a>
                <a href="/legal/privacy" className="hover:text-muted">Privacy Policy</a>
                <a href="/legal/refund" className="hover:text-muted">Refund Policy</a>
              </div>
              <div className="text-[11px] text-dim lg:hidden">Made with ❤️ by the Syncourse Team · © 2026</div>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
