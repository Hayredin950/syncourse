"use client";

import { usePathname } from "next/navigation";
import { TopNav, Footer, BottomNav } from "@/components/Nav";
import LegalConsent from "@/components/LegalConsent";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  return (
    <div className="site-shell">
      <TopNav />
      {children}
      {!isAdmin && <Footer />}
      {!isAdmin && <BottomNav />}
      <LegalConsent />
    </div>
  );
}
