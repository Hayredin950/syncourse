"use client";

import Link from "next/link";
import { CoverImage } from "@/components/CoverImage";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, useRef, useCallback, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  Bookmark,
  BookOpen,
  CircleUserRound,
  Crown,
  FileText,
  Home,
  LayoutGrid,
  MessageCircle,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { get } from "@/lib/api";
import { Wordmark } from "@/components/Wordmark";

/** The slice of /search the type-ahead needs; cards and bodies stay on the page. */
interface QuickResults {
  courses: { id: string; title: string; slug: string; thumbnailUrl: string | null }[];
  resources: { id: string; title: string; slug: string; type: string }[];
  lecturers: { id: string; name: string; slug: string; photoUrl: string | null }[];
  organizations: { id: string; name: string; slug: string; logoUrl: string | null }[];
}

interface QuickHit {
  href: string;
  label: string;
  kind: string;
  imageUrl: string | null;
}

const CATS = [
  { key: "all", label: "All Courses", href: "/browse", icon: LayoutGrid },
  { key: "mini", label: "Mini-courses", href: "/browse?type=mini-course", icon: Zap },
  { key: "resources", label: "Resources", href: "/resources", icon: FileText },
];

/* Category chips read `?type=` so the active pill matches the filter. They live
   behind their own Suspense boundary: the rest of the bar still server-renders,
   and the fallback is the same row with no selection rather than a gap. */
function CatLinks({ pathname, type }: { pathname: string; type: string }) {
  const catOn = (key: string) => {
    // "All Courses" covers the browse page at large; mini-courses and
    // resources are the two narrower shelves, and roadmaps live inside
    // Resources rather than getting a chip of their own.
    if (key === "all") return pathname === "/browse" && type !== "mini-course";
    if (key === "mini") return pathname === "/browse" && type === "mini-course";
    if (key === "resources") return pathname.startsWith("/resources");
    return false;
  };
  return (
    <div className="nav-cats no-scrollbar" aria-label="Catalogue types">
      {CATS.map((c) => {
        const on = catOn(c.key);
        return (
          <Link
            key={c.key}
            href={c.href}
            className={`nav-cat ${on ? "active" : ""}`}
            aria-label={c.label}
            title={c.label}
          >
            <c.icon size={17} strokeWidth={1.8} />
            <span>{c.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function NavCats({ pathname }: { pathname: string }) {
  const type = useSearchParams().get("type") ?? "";
  return <CatLinks pathname={pathname} type={type} />;
}

/* ---------- TopNav — desktop top bar ---------- */
export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isPremium, logout } = useAuth();
  const [value, setValue] = useState("");
  const [meOpen, setMeOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [quick, setQuick] = useState<QuickResults | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [hit, setHit] = useState(-1);
  const meRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLFormElement>(null);

  const closeMe = useCallback(() => setMeOpen(false), []);
  useEffect(() => {
    if (!meOpen) return;
    const handler = (e: MouseEvent) => {
      if (meRef.current && !meRef.current.contains(e.target as Node)) setMeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [meOpen]);
  useEffect(() => setMeOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (hit >= 0 && hits[hit]) {
      setQuickOpen(false);
      router.push(hits[hit].href);
      return;
    }
    setQuickOpen(false);
    router.push(`/search${value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ""}`);
  };

  /* Live suggestions for the main box. It used to submit only courses; every
     result type is now one keystroke away. 170ms is long enough that typing a
     word is one request and short enough that the list feels attached. */
  useEffect(() => {
    const query = value.trim();
    setHit(-1);
    if (query.length < 2) {
      setQuick(null);
      setQuickOpen(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      get<QuickResults>(`/search?q=${encodeURIComponent(query)}&limit=5`)
        .then((d) => {
          if (cancelled) return;
          setQuick(d);
          setQuickOpen(true);
        })
        .catch(() => {
          if (!cancelled) setQuick(null);
        });
    }, 170);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => setQuickOpen(false), [pathname]);

  useEffect(() => {
    if (!quickOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setQuickOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [quickOpen]);

  const hits = useMemo<QuickHit[]>(() => {
    if (!quick) return [];
    return [
      ...quick.courses.slice(0, 5).map((c) => ({
        href: `/courses/${c.slug}`,
        label: c.title,
        kind: "Course",
        imageUrl: c.thumbnailUrl ?? null,
      })),
      ...quick.resources.slice(0, 4).map((r) => ({
        href: `/resources/${r.slug}`,
        label: r.title,
        kind: "Resource",
        imageUrl: null,
      })),
      ...quick.lecturers.slice(0, 3).map((l) => ({
        href: `/lecturers/${l.slug}`,
        label: l.name,
        kind: "Lecturer",
        imageUrl: l.photoUrl,
      })),
      ...quick.organizations.slice(0, 3).map((o) => ({
        href: `/organizations/${o.slug}`,
        label: o.name,
        kind: "Channel",
        imageUrl: o.logoUrl,
      })),
    ];
  }, [quick]);

  const onSearchKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setQuickOpen(false);
      return;
    }
    if (!quickOpen || hits.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHit((i) => (i + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHit((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (event.key === "Enter" && hit >= 0) {
      event.preventDefault();
      setQuickOpen(false);
      router.push(hits[hit].href);
    }
  };

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  if (pathname.startsWith("/auth")) return null;

  return (
    <header className={`topbar desktop-only ${stuck ? "is-stuck" : ""}`}>
      <div className="topbar-row topbar-row--main">
        <Link href="/" className="brand" aria-label="Syncourse home">
          <Wordmark />
        </Link>

        <div className="topbar-center">
          <form className="top-search" onSubmit={submit} role="search" ref={searchRef}>
            <Search size={18} strokeWidth={1.8} />
            <input
              aria-label="Search courses, resources, lecturers and channels"
              placeholder="Search everything"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => {
                if (value.trim().length >= 2) setQuickOpen(true);
              }}
              onKeyDown={onSearchKey}
              aria-expanded={quickOpen}
              aria-controls="top-search-hits"
              autoComplete="off"
            />
            {value && (
              <button
                type="button"
                className="top-search__clear"
                aria-label="Clear search"
                onClick={() => {
                  setValue("");
                  setQuick(null);
                  setQuickOpen(false);
                }}
              >
                <X size={14} />
              </button>
            )}
            {quickOpen && value.trim().length >= 2 && (
              <div className="top-search__panel" id="top-search-hits">
                {hits.length === 0 ? (
                  <p className="top-search__empty">
                    Nothing matches “{value.trim()}”. Press Enter to search the whole catalogue.
                  </p>
                ) : (
                  <>
                    <div className="top-search__list" role="listbox" aria-label="Search suggestions">
                      {hits.map((h, i) => (
                        <Link
                          key={h.href}
                          href={h.href}
                          role="option"
                          aria-selected={i === hit}
                          className={`top-search__hit ${i === hit ? "is-on" : ""}`}
                          onMouseEnter={() => setHit(i)}
                          onClick={() => setQuickOpen(false)}
                        >
                          <span className="top-search__art">
                            {h.imageUrl ? (
                              <CoverImage src={h.imageUrl} transform={{ width: 56, height: 56 }} />
                            ) : (
                              <FileText size={14} />
                            )}
                          </span>
                          <span className="top-search__label">{h.label}</span>
                          <span className="top-search__kind">{h.kind}</span>
                        </Link>
                      ))}
                    </div>
                    <button type="submit" className="top-search__all">
                      See all results for “{value.trim()}”
                    </button>
                  </>
                )}
              </div>
            )}
          </form>
          <Suspense fallback={<CatLinks pathname={pathname} type="" />}>
            <NavCats pathname={pathname} />
          </Suspense>
        </div>

        <nav className="nav-links" aria-label="Primary">
          <Link
            href="/assistant"
            aria-label="Ask the study assistant"
            className={`nav-pill nav-pill--ask ${active("/assistant") ? "active" : ""}`}
          >
            <Sparkles size={19} strokeWidth={1.8} /> <span className="nav-label">Ask</span>
          </Link>
          <Link href="/browse" aria-label="Browse" className={`nav-pill ${active("/browse") ? "active" : ""}`}>
            <LayoutGrid size={19} strokeWidth={1.8} /> <span className="nav-label">Browse</span>
          </Link>
          <Link href="/circles" aria-label="Circles" className={`nav-pill ${active("/circles") ? "active" : ""}`}>
            <MessageCircle size={19} strokeWidth={1.8} /> <span className="nav-label">Circles</span>
          </Link>
          <Link href="/lists" aria-label="Collections" className={`nav-pill ${active("/lists") ? "active" : ""}`}>
            <Bookmark size={19} strokeWidth={1.8} /> <span className="nav-label">Collections</span>
          </Link>
          {isPremium ? (
            <span className="nav-pill nav-pill--premium">
              <Crown size={17} strokeWidth={1.8} /> <span className="nav-label">Premium</span>
            </span>
          ) : (
            <Link href="/premium" aria-label="Go Premium" className="nav-pill nav-pill--cta">
              <Crown size={17} strokeWidth={1.8} /> <span className="nav-label">Go Premium</span>
            </Link>
          )}
          {user?.isStaff && (
            <Link href="/admin" aria-label="Admin console" className={`nav-pill nav-pill--admin ${active("/admin") ? "active" : ""}`}>
              Admin
            </Link>
          )}
          {user ? (
            <div className="nav-me-wrap" ref={meRef}>
              <button
                type="button"
                className={`nav-pill nav-pill--me ${active("/me") ? "active" : ""} ${meOpen ? "open" : ""}`}
                title={user.name}
                onClick={() => setMeOpen((o) => !o)}
                aria-expanded={meOpen}
              >
                <span className="nav-me__avatar">
                  {/* Initial stays put; the photo covers it once it decodes. */}
                  <span>{(user.name || "?").charAt(0).toUpperCase()}</span>
                  <CoverImage src={user.avatarUrl} transform={{ width: 72, height: 72 }} className="absolute inset-0 h-full w-full object-cover" eager />
                </span>
                <span className="nav-label">Me</span>
                <svg
                  className="nav-me__chevron"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {meOpen && (
                <div className="me-dropdown">
                  <div className="me-dropdown__header">
                    <span className="nav-me__avatar" style={{ width: 36, height: 36 }}>
                      <span>{(user.name || "?").charAt(0).toUpperCase()}</span>
                      <CoverImage src={user.avatarUrl} transform={{ width: 72, height: 72 }} className="absolute inset-0 h-full w-full object-cover" eager />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="me-dropdown__name">{user.name}</div>
                      <div className="me-dropdown__email">{user.email}</div>
                    </div>
                  </div>
                  <div className="me-dropdown__sep" />
                  <Link href="/me" className="me-dropdown__item" onClick={closeMe}>
                    <CircleUserRound size={16} strokeWidth={1.8} /> Your profile
                  </Link>
                  <Link href="/my-learning" className="me-dropdown__item" onClick={closeMe}>
                    <BookOpen size={16} strokeWidth={1.8} /> My learning
                  </Link>
                  <Link href="/assistant" className="me-dropdown__item" onClick={closeMe}>
                    <Sparkles size={16} strokeWidth={1.8} /> Study assistant
                  </Link>
                  <Link href="/recommendations" className="me-dropdown__item" onClick={closeMe}>
                    <Sparkles size={16} strokeWidth={1.8} /> For you
                  </Link>
                  <Link href="/premium" className="me-dropdown__item" onClick={closeMe}>
                    <Crown size={16} strokeWidth={1.8} /> Subscription
                  </Link>
                  <div className="me-dropdown__sep" />
                  <button
                    type="button"
                    className="me-dropdown__item me-dropdown__item--danger"
                    onClick={() => {
                      closeMe();
                      logout();
                      router.push("/");
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" x2="9" y1="12" y2="12" />
                    </svg>
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/auth" className={`nav-pill ${active("/auth") ? "active" : ""}`}>
              <CircleUserRound size={19} strokeWidth={1.8} /> <span className="nav-label">Sign in</span>
            </Link>
          )}
        </nav>
      </div>

    </header>
  );
}

/* ---------- MobileHeader ---------- */
export function MobileHeader({ title }: { title?: string }) {
  return (
    <div className="mobile-head">
      <Link href="/" className="brand" aria-label="Syncourse home">
        {title && title !== "Syncourse" ? <span className="mobile-page-title">{title}</span> : <Wordmark small />}
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link href="/assistant" className="icon-btn icon-btn--ask" aria-label="Ask the study assistant" title="Ask the study assistant">
          <Sparkles size={19} strokeWidth={1.8} />
        </Link>
        <Link href="/search" className="icon-btn" aria-label="Search">
          <Search size={19} strokeWidth={1.8} />
        </Link>
        <Link href="/me" className="icon-btn" aria-label="Your profile">
          <CircleUserRound size={19} strokeWidth={1.8} />
        </Link>
      </div>
    </div>
  );
}

/* ---------- BottomNav — fixed mobile tab bar ---------- */
export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/auth")) return null;
  const tabs = [
    { href: "/", label: "Home", icon: Home, on: pathname === "/" },
    {
      href: "/browse",
      label: "Browse",
      icon: LayoutGrid,
      on: pathname.startsWith("/browse") || pathname.startsWith("/resources") || pathname.startsWith("/courses"),
    },
    { href: "/assistant", label: "Ask", icon: Sparkles, on: pathname.startsWith("/assistant") },
    { href: "/search", label: "Search", icon: Search, on: pathname.startsWith("/search") },
    { href: "/lists", label: "Collections", icon: Bookmark, on: pathname.startsWith("/lists") },
    { href: "/me", label: "Me", icon: CircleUserRound, on: pathname.startsWith("/me") || pathname.startsWith("/my-learning") },
  ];
  return (
    <nav className="mobile-nav mobile-only" aria-label="Primary">
      <div className="mnav-grid">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={t.on ? "active" : ""} aria-current={t.on ? "page" : undefined}>
            <t.icon strokeWidth={t.on ? 2 : 1.7} />
            <span>{t.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

/* ---------- Footer ---------- */
export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/auth")) return null;
  return (
    <footer className="footer desktop-only">
      <div>
        <Link href="/" className="brand">
          <Wordmark />
        </Link>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Practical skills for people who build.
        </p>
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
      <div className="section-head__left">
        <h2>
          {title}
          <ChevronRightInline />
        </h2>
      </div>
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
    <svg className="chev" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* re-export a few icons commonly needed by pages */
export { Bookmark, Home as HomeIcon, Layers3 as LayersIcon } from "lucide-react";
