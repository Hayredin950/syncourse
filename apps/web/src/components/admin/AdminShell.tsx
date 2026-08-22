"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight, ExternalLink, Search, Shield } from "lucide-react";
import { get } from "@/lib/api";
import type { AdminStats } from "@/lib/types";
import { ADMIN_NAV, ADMIN_NAV_FLAT, activeNavItem } from "./nav";
import CommandPalette from "./CommandPalette";
import { AdminToastProvider } from "./AdminToast";

/**
 * The admin frame: a grouped sidebar rail, a sticky breadcrumb bar with the ⌘K
 * trigger, and one toast stack for the whole console.
 *
 * This replaced a single horizontal strip of nine pill tabs. Nine is already
 * past the point where a tab row can be scanned, and the row had no room left
 * for the sections this console still needs. A grouped vertical rail also frees
 * the top bar for the things that belong there — where you are, and search.
 *
 * Below 900px the rail is dropped for a scrolling tab strip; the CSS owns that
 * switch so both live in one place.
 */
const COLLAPSE_KEY = "syncourse_admin_rail";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const current = activeNavItem(pathname);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  const toggleRail = () => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      return !v;
    });
  };

  // Badge counts. One request for the whole shell — the pending-payment count is
  // the one number worth carrying on the nav, since it is the only queue where
  // waiting costs a user their upgrade.
  useEffect(() => {
    get<AdminStats>("/admin/stats").then(setStats).catch(() => {});
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AdminToastProvider>
      <div className={`admin-shell ${collapsed ? "admin-shell--collapsed" : ""}`}>
        <aside className="admin-sidebar">
          <Link href="/admin" className="admin-sidebar__brand" title="Syncourse admin">
            <span className="admin-sidebar__mark">
              <Shield size={14} />
            </span>
            <span>
              <span className="admin-sidebar__name">Syncourse</span>
              <span className="admin-sidebar__role">Admin console</span>
            </span>
          </Link>

          {ADMIN_NAV.map((group) => (
            <div key={group.label} className="admin-nav-group">
              <div className="admin-nav-group__label">{group.label}</div>
              {group.items.map((item) => {
                const active = current?.href === item.href;
                const count = item.badge && stats ? stats[item.badge] : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`admin-nav-link ${active ? "admin-nav-link--active" : ""} ${
                      count ? "admin-nav-link--attn" : ""
                    }`}
                  >
                    <item.icon size={15} />
                    <span>{item.label}</span>
                    {!collapsed && count ? <span className="admin-nav-link__count">{count}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}

          <div className="admin-sidebar__spacer" />
          <div className="admin-sidebar__foot">
            <Link href="/" className="admin-nav-link" title="Back to site">
              <ExternalLink size={15} />
              <span>Back to site</span>
            </Link>
            <button type="button" className="admin-collapse" onClick={toggleRail}>
              {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
              <span>Collapse</span>
            </button>
          </div>
        </aside>

        <div className="admin-main">
          <header className="admin-topbar">
            <nav className="admin-crumbs" aria-label="Breadcrumb">
              <Link href="/admin">Admin</Link>
              <span aria-hidden="true">/</span>
              <strong>{current?.label ?? "Dashboard"}</strong>
            </nav>
            <div className="admin-topbar__actions">
              <button type="button" className="admin-search-trigger" onClick={() => setPaletteOpen(true)}>
                <Search size={14} />
                <span>Search…</span>
                <kbd className="admin-kbd">⌘K</kbd>
              </button>
              <Link href="/" className="admin-topbar__exit">
                <ExternalLink size={12} />
                <span>Site</span>
              </Link>
            </div>
          </header>

          {/* Mobile nav — CSS shows this only once the rail is hidden. */}
          <nav className="admin-tabs" aria-label="Admin sections">
            {ADMIN_NAV_FLAT.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-tab ${current?.href === item.href ? "admin-tab--active" : ""}`}
              >
                <item.icon size={14} />
                {item.label}
              </Link>
            ))}
          </nav>

          <main className="admin-content">{children}</main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </AdminToastProvider>
  );
}
