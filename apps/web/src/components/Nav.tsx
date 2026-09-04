"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback, type FormEvent, type ReactNode } from "react";
import {
  Bookmark,
  BookOpen,
  CircleUserRound,
  Crown,
  FileText,
  Home,
  Layers3,
  MessageCircle,
  Search,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

/* ---------- TopNav — desktop top bar ---------- */
/**
 * One row, not two. The second row repeated the same six destinations the pills
 * and the resources page already cover, and half of them only differed by a
 * query string — so it read as navigation but behaved like a filter that had
 * wandered out of the page it belonged to. Course/mini-course now live as tabs
 * on /browse, and the resource types as tabs on /resources.
 */
export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isPremium, logout } = useAuth();
  const [value, setValue] = useState("");
  const [meOpen, setMeOpen] = useState(false);
  const meRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  const closeMe = useCallback(() => setMeOpen(false), []);
  useEffect(() => {
    if (!meOpen) return;
    const handler = (e: MouseEvent) => {
      if (meRef.current && !meRef.current.contains(e.target as Node)) setMeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [meOpen]);
  // Close on route change
  useEffect(() => setMeOpen(false), [pathname]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    router.push(`/search${value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ""}`);
  };

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // phonofilm: auth screens have no site navbar. This must sit *below* every
  // hook — an early return above them changes the hook count between routes,
  // which React rejects outright.
  if (pathname.startsWith("/auth")) return null;

  return (
    <header className="topbar desktop-only">
      <div className="topbar-row topbar-row--main">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="brand-logo" />
          <span className="brand-ourse">yncourse</span>
        </Link>
        <form className="top-search" onSubmit={submit}>
          <Search size={15} />
          <input
            aria-label="Search courses"
            placeholder="Search courses"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </form>
        <nav className="nav-links">
          <Link href="/browse" className={`nav-pill ${active("/browse") ? "active" : ""}`}>
            <BookOpen size={14} /> Courses
          </Link>
          <Link href="/resources" className={`nav-pill ${active("/resources") ? "active" : ""}`}>
            <FileText size={14} /> Resources
          </Link>
          <Link href="/circles" className={`nav-pill ${active("/circles") ? "active" : ""}`}>
            <MessageCircle size={14} /> Circles
          </Link>
          <Link href="/lists" className={`nav-pill ${active("/lists") ? "active" : ""}`}>
            <Bookmark size={14} /> Collections
          </Link>
          {isPremium ? (
            <span className="nav-pill nav-pill--premium">Premium</span>
          ) : (
            <Link href="/premium" className="nav-pill nav-pill--cta">
              <Crown size={14} /> Go Premium
            </Link>
          )}
          {user?.isStaff && (
            <Link href="/admin" className={`nav-pill nav-pill--admin ${active("/admin") ? "active" : ""}`}>
              <Crown size={14} /> Admin
            </Link>
          )}
          {user ? (
            <div className="nav-me-wrap" ref={meRef}>
              <button
                type="button"
                className={`nav-pill nav-pill--me ${active("/me") ? "active" : ""} ${meOpen ? "open" : ""}`}
                title={user.name}
                onClick={() => setMeOpen((o) => !o)}
              >
                <span className="nav-me__avatar">
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold">{(user.name || "?").charAt(0).toUpperCase()}</span>
                  )}
                </span>
                Me
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`nav-me__chevron ${meOpen ? "open" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
              </button>
              {meOpen && (
                <div className="me-dropdown">
                  <div className="me-dropdown__header">
                    <span className="nav-me__avatar" style={{ width: 32, height: 32 }}>
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold">{(user.name || "?").charAt(0).toUpperCase()}</span>
                      )}
                    </span>
                    <div>
                      <div className="me-dropdown__name">{user.name}</div>
                      <div className="me-dropdown__email">{user.email}</div>
                    </div>
                  </div>
                  <div className="me-dropdown__sep" />
                  <Link href="/me" className="me-dropdown__item" onClick={closeMe}>
                    <CircleUserRound size={15} /> Profile
                  </Link>
                  <div className="me-dropdown__sep" />
                  <button type="button" className="me-dropdown__item me-dropdown__item--danger" onClick={() => { closeMe(); logout(); router.push("/"); }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/auth" className={`nav-pill ${active("/auth") ? "active" : ""}`}>
              <CircleUserRound size={14} /> Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

/* ---------- MobileHeader — per-page title (mobile only) ---------- */
/**
 * Phone-only, and the styling has to live in a class for that to hold: this used
 * to carry `style={{ display: "flex" }}` beside `.mobile-only`, and an inline
 * style outranks any stylesheet rule — so `.mobile-only { display: none }` never
 * applied and all 34 call sites rendered a second brand link and search button on
 * desktop, stacked under the real top bar.
 */
export function MobileHeader({ title = "Syncourse" }: { title?: string }) {
  return (
    <div className="mobile-head">
      <Link href="/" className="brand">
        {title}
      </Link>
      <Link href="/search" className="icon-btn" aria-label="Search">
        <Search size={18} />
      </Link>
    </div>
  );
}

/* ---------- BottomNav — fixed mobile tab bar ---------- */
/**
 * The whole top bar is desktop-only, so this is the entire site navigation on a
 * phone. Five slots, and Courses and Resources used to take two of them for what
 * is one job — browsing the library — which left Collections with no way in at
 * all. They are now one Browse tab that lands on /browse and stays lit on
 * /resources, with `BrowseTabs` switching between the two halves.
 */
export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/auth")) return null;
  const tabs = [
    { href: "/", label: "Home", icon: Home, on: pathname === "/" },
    {
      href: "/browse",
      label: "Browse",
      icon: BookOpen,
      on: pathname.startsWith("/browse") || pathname.startsWith("/resources") || pathname.startsWith("/courses"),
    },
    { href: "/lists", label: "Collections", icon: Bookmark, on: pathname.startsWith("/lists") },
    { href: "/circles", label: "Circles", icon: MessageCircle, on: pathname.startsWith("/circles") },
    { href: "/me", label: "Me", icon: CircleUserRound, on: pathname.startsWith("/me") },
  ];
  return (
    <nav className="mobile-nav mobile-only">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={t.on ? "active" : ""}>
          <t.icon />
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/* ---------- Footer — desktop only ---------- */
export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/auth")) return null;
  return (
    <footer className="footer desktop-only">
      <div>
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="brand-logo" />
          <span className="brand-ourse">yncourse</span>
        </div>
        <p className="muted">Practical skills for people who build.</p>
      </div>
      <div>
        <div className="mono">GET THE APP</div>
        <div>Android · Windows · macOS</div>
      </div>
      <div>
        <div className="mono">SUPPORT</div>
        <div>
          <Link href="/legal/terms">Contact support</Link> · <Link href="/legal/terms">Terms</Link> ·{" "}
          <Link href="/legal/privacy">Privacy</Link> · <Link href="/legal/refund">Refunds</Link>
        </div>
      </div>
    </footer>
  );
}

/* ---------- shared layout pieces ---------- */
export function Page({ children }: { children: ReactNode }) {
  return <main className="page">{children}</main>;
}

export function SectionHead({
  title,
  href,
  right,
}: {
  title: ReactNode;
  href?: string;
  right?: ReactNode;
}) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {right}
        {href && (
          <Link href={href}>
            See all <ChevronRightInline />
          </Link>
        )}
      </div>
    </div>
  );
}

function ChevronRightInline() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ verticalAlign: "middle" }}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* re-export a few icons commonly needed by pages */
export { Bookmark, Home as HomeIcon, Layers3 as LayersIcon };
