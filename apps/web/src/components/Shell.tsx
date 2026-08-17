"use client";

import { usePathname } from "next/navigation";
import { TopNav, Footer, BottomNav } from "@/components/Nav";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  return (
    <div className="site-shell">
      {!isAdmin && <TopNav />}
      {children}
      {!isAdmin && <Footer />}
      {!isAdmin && <BottomNav />}
    </div>
  );
}
