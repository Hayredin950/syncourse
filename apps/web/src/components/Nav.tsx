"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Bookmark,
  BookOpen,
  CircleUserRound,
  Crown,
  FileText,
  Home,
  LayoutGrid,
  Layers3,
  Map,
  MessageCircle,
  Search,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

/* ---------- TopNav — desktop top bar (phonofilm-style, two rows) ---------- */
const CONTENT_TYPES = [
  { value: "", label: "All", icon: LayoutGrid },
  { value: "course", label: "Course", icon: BookOpen },
  { value: "mini-course", label: "Mini-course", icon: Zap },
  { value: "cheat-sheet", label: "Cheat-sheet", icon: FileText },
  { value: "roadmap", label: "Roadmap", icon: Map },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isPremium } = useAuth();
  const [value, setValue] = useState("");
  const [type, setType] = useState("");

  // phonofilm: auth screens have no site navbar
  if (pathname.startsWith("/auth")) return null;

  // Row-2 active state reads ?type= from the URL (avoids useSearchParams/Suspense in the layout).
  useEffect(() => {
    setType(new URLSearchParams(window.location.search).get("type") ?? "");
  }, [pathname]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    router.push(`/search${value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ""}`);
  };

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

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
            <LayoutGrid size={14} /> Browse
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
            <Link href="/me" className={`nav-pill nav-pill--me ${active("/me") ? "active" : ""}`} title={user.name}>
              <span className="nav-me__avatar">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs font-bold">{(user.name || "?").charAt(0).toUpperCase()}</span>
                )}
              </span>
              Me
            </Link>
          ) : (
            <Link href="/auth" className={`nav-pill ${active("/auth") ? "active" : ""}`}>
              <CircleUserRound size={14} /> Sign in
            </Link>
          )}
        </nav>
      </div>
      <div className="topbar-row topbar-row--types">
        {CONTENT_TYPES.map((t) => (
          <Link
            key={t.value || "all"}
            href={t.value ? `/browse?type=${t.value}` : "/browse"}
            className={`type-pill ${type === t.value ? "active" : ""}`}
          >
            <t.icon size={13} /> {t.label}
          </Link>
        ))}
      </div>
    </header>
  );
}

/* ---------- MobileHeader — per-page title (mobile only) ---------- */
export function MobileHeader({ title = "Syncourse" }: { title?: string }) {
  return (
    <div className="mobile-only" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 23 }}>
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
export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/auth")) return null;
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const tabs = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search", label: "Search", icon: Search },
    { href: "/lists", label: "Collections", icon: Layers3 },
    { href: "/me", label: "Me", icon: CircleUserRound },
  ];
  return (
    <nav className="mobile-nav mobile-only">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={active(t.href) ? "active" : ""}>
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
