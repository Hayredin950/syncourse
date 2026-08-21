"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Star,
  CreditCard,
  GraduationCap,
  Building2,
  Tag,
  Settings,
  Shield,
  ChevronRight,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/lecturers", label: "Lecturers", icon: GraduationCap },
  { href: "/admin/publishers", label: "Publishers", icon: Building2 },
  { href: "/admin/categories", label: "Categories", icon: Tag },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="admin-shell">
      {/* Admin sub-nav — horizontal tabs below the main topbar */}
      <div className="admin-topbar">
        <div className="admin-topbar__left">
          <Shield size={18} className="admin-topbar__shield" />
          <span className="admin-topbar__title">Admin</span>
          <ChevronRight size={14} className="admin-topbar__sep" />
          <span className="admin-topbar__section">
            {NAV.find((n) =>
              n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href)
            )?.label ?? "Dashboard"}
          </span>
        </div>
        <Link href="/" className="admin-topbar__exit">
          ← Back to site
        </Link>
      </div>

      {/* Tab strip */}
      <nav className="admin-tabs">
        {NAV.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-tab ${active ? "admin-tab--active" : ""}`}
            >
              <item.icon size={15} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Content */}
      <main className="admin-content">{children}</main>
    </div>
  );
}
