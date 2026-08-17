"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "▦" },
  { href: "/admin/courses", label: "Courses", icon: "▤" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/reviews", label: "Reviews", icon: "★" },
  { href: "/admin/payments", label: "Payments", icon: "💳" },
  { href: "/admin/lecturers", label: "Lecturers", icon: "👤" },
  { href: "/admin/publishers", label: "Publishers", icon: "🏛" },
  { href: "/admin/categories", label: "Categories", icon: "🏷" },
  { href: "/admin/settings", label: "Settings", icon: "⚙" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__logo">
          sync<span>ourse</span> <em>Admin</em>
        </div>
        <nav className="admin-sidebar__nav">
          {NAV.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-link ${active ? "admin-nav-link--active" : ""}`}
              >
                <span className="admin-nav-link__icon">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/" className="admin-sidebar__exit">
          ← Back to site
        </Link>
      </aside>
      <main className="admin-content">{children}</main>
    </div>
  );
}
