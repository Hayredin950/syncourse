"use client";

import { usePathname } from "next/navigation";
import { TopNav, Footer, BottomNav } from "@/components/Nav";
import LegalConsent from "@/components/LegalConsent";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  // The console is a full application, not a page of the site: it brings its own
  // breadcrumb bar, its own nav and its own "back to site" exit. Rendering the
  // public top bar above it stacked two navigations — and since both are sticky,
  // the admin bar spent every scroll hidden behind the public one.
  return (
    <div className="site-shell">
      {!isAdmin && <TopNav />}
      {children}
      {!isAdmin && <Footer />}
      {!isAdmin && <BottomNav />}
      <LegalConsent />
    </div>
  );
}
