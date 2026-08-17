"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  Bookmark,
  CircleUserRound,
  Home,
  Layers3,
  Search,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

/* ---------- TopNav — desktop top bar (phonofilm-style) ---------- */
export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isPremium } = useAuth();
  const [value, setValue] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    router.push(`/search${value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ""}`);
  };

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="topbar desktop-only">
      <Link href="/" className="brand">
        sync<i />ourse
      </Link>
      <Link href="/browse" className={active("/browse") ? "active" : ""}>
        Browse
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
        <Link href="/circles" className={active("/circles") ? "active" : ""}>
          circles
        </Link>
        <Link href="/lists" className={active("/lists") ? "active" : ""}>
          Collections
        </Link>
        <Link href="/me" className={active("/me") ? "active" : ""}>
          Me
        </Link>
        {isPremium ? (
          <span className="badge primary">Premium</span>
        ) : (
          <Link href="/premium" className="upgrade">
            Go Premium <Zap size={12} style={{ display: "inline", verticalAlign: "middle" }} />
          </Link>
        )}
        {user ? (
          <Link
            href="/me"
            title={user.name}
            className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-raised"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-accent">{user.name.charAt(0).toUpperCase()}</span>
            )}
          </Link>
        ) : (
          <Link href="/auth" className={active("/auth") ? "active" : ""}>
            Sign in
          </Link>
        )}
      </nav>
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
  return (
    <footer className="footer desktop-only">
      <div>
        <div className="brand">
          sync<i />ourse
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
