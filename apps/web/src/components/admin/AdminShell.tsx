"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight, ExternalLink, Menu, Search, Shield, X } from "lucide-react";
import { get } from "@/lib/api";
import type { AdminStats } from "@/lib/types";
import { ADMIN_NAV, activeNavItem } from "./nav";
import CommandPalette from "./CommandPalette";
import { AdminToastProvider } from "./AdminToast";

/**
 * The admin frame: a grouped sidebar rail on desktop, the same grouped list in a
 * slide-in drawer on a phone, a sticky breadcrumb bar, and one toast stack.
 *
 * The drawer replaced a horizontally scrolling strip of fourteen pill tabs. A
 * strip that wide cannot show where you are or where you could go — it clipped
 * mid-label with no scroll affordance, so the breadcrumb became the only
 * navigation on a phone. A drawer carries the full grouped structure at any
 * width, which is the whole point of grouping it.
 */
const COLLAPSE_KEY = "syncourse_admin_rail";

/** One link list, two mounts: the desktop rail and the mobile drawer. */
function NavGroups({
  stats,
  current,
  collapsed,
  onNavigate,
}: {
  stats: AdminStats | null;
  current?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {ADMIN_NAV.map((group) => (
        <div key={group.label} className="admin-nav-group">
          <div className="admin-nav-group__label">{group.label}</div>
          {group.items.map((item) => {
            const active = current === item.href;
            const count = item.badge && stats ? stats[item.badge] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
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
    </>
  );
}
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragFrom = useRef<number | null>(null);
  const current = activeNavItem(pathname);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

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

  // Navigating closes the drawer; on a static export the route changes without a
  // remount, so nothing else would.
  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Scroll lock while the drawer owns the screen.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);
  // Swipe-to-close. The panel follows the finger leftward only, so a vertical
  // scroll inside the nav is never mistaken for a dismissal.
  const onTouchStart = (e: React.TouchEvent) => {
    dragFrom.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragFrom.current === null || !panelRef.current) return;
    const dx = Math.min(0, e.touches[0].clientX - dragFrom.current);
    panelRef.current.style.transition = "none";
    panelRef.current.style.transform = `translateX(${dx}px)`;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (dragFrom.current === null || !panelRef.current) return;
    const dx = e.changedTouches[0].clientX - dragFrom.current;
    panelRef.current.style.transition = "";
    panelRef.current.style.transform = "";
    dragFrom.current = null;
    if (dx < -56) closeDrawer();
  };

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

          <NavGroups stats={stats} current={current?.href} collapsed={collapsed} />

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
            <button
              type="button"
              className="admin-burger"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open admin menu"
              aria-expanded={drawerOpen}
            >
              <Menu size={17} />
            </button>
            <nav className="admin-crumbs" aria-label="Breadcrumb">
              <Link href="/admin">Admin</Link>
              <span aria-hidden="true">/</span>
              <strong>{current?.label ?? "Dashboard"}</strong>
            </nav>
            <div className="admin-topbar__actions">
              <button
                type="button"
                className="admin-search-trigger"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search the console"
              >
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

          <main className="admin-content">{children}</main>
        </div>
      </div>
      {/* Mobile nav. CSS keeps this out of the way entirely above 900px. */}
      <div className={`admin-drawer ${drawerOpen ? "admin-drawer--open" : ""}`}>
        <div className="admin-drawer__scrim" onClick={closeDrawer} aria-hidden="true" />
        <nav
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Admin sections"
          className="admin-drawer__panel"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="admin-drawer__head">
            <Link href="/admin" className="admin-sidebar__brand" onClick={closeDrawer}>
              <span className="admin-sidebar__mark">
                <Shield size={14} />
              </span>
              <span>
                <span className="admin-sidebar__name">Syncourse</span>
                <span className="admin-sidebar__role">Admin console</span>
              </span>
            </Link>
            <button type="button" className="admin-drawer__x" onClick={closeDrawer} aria-label="Close menu">
              <X size={16} />
            </button>
          </div>
          <div className="admin-drawer__body">
            <NavGroups stats={stats} current={current?.href} onNavigate={closeDrawer} />
          </div>
          <div className="admin-drawer__foot">
            <Link href="/" className="admin-nav-link" onClick={closeDrawer}>
              <ExternalLink size={15} />
              <span>Back to site</span>
            </Link>
          </div>
        </nav>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </AdminToastProvider>
  );
}
