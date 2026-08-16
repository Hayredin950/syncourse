import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Nav } from "@/components/Nav";

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
          <main className="mx-auto w-full max-w-[420px] min-h-screen pb-20">{children}</main>
          <footer className="border-t border-border bg-bg">
            <div className="mx-auto flex max-w-[420px] flex-col items-center gap-1 px-4 py-6 text-center">
              <div className="text-xs text-muted">
                <span className="font-semibold text-text">GET THE APP</span> — Android · Android TV · Windows · macOS
              </div>
              <div className="flex gap-3 text-[11px] text-dim">
                <a href="/legal/terms" className="hover:text-muted">Terms of Service</a>
                <a href="/legal/privacy" className="hover:text-muted">Privacy Policy</a>
                <a href="/legal/refund" className="hover:text-muted">Refund Policy</a>
              </div>
              <div className="text-[11px] text-dim">Made with ❤️ by the Syncourse Team · © 2026</div>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
