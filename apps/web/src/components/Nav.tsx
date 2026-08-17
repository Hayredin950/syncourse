"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const tabs = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/search", label: "Search", icon: "🔍" },
  { href: "/my-learning", label: "My Learning", icon: "📚" },
  { href: "/me", label: "Me", icon: "👤" },
];

export function Nav() {
  const pathname = usePathname();
  const { user, isPremium } = useAuth();

  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* top header */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:px-8">
          <Link href="/" className="text-lg font-bold tracking-tight text-text">
            Syncourse<span className="text-accent">.</span>
          </Link>
          <nav className="ml-auto flex items-center gap-3 text-sm">
            <Link
              href="/browse"
              className={pathname.startsWith("/browse") ? "font-medium text-accent" : "text-muted hover:text-text"}
            >
              Browse
            </Link>
            <Link
              href="/circles"
              className={`hidden sm:inline ${pathname.startsWith("/circles") ? "font-medium text-accent" : "text-muted hover:text-text"}`}
            >
              circles
            </Link>
            <Link
              href="/lists"
              className={`hidden sm:inline ${pathname.startsWith("/lists") ? "font-medium text-accent" : "text-muted hover:text-text"}`}
            >
              Collections
            </Link>
            {isPremium ? (
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">Premium</span>
            ) : (
              <Link
                href="/premium"
                className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-black hover:bg-accent-hover"
              >
                Free-Upgrade
              </Link>
            )}
            {user ? (
              <Link href="/me" className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-surface-raised">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs font-semibold text-accent">{user.name.charAt(0).toUpperCase()}</span>
                )}
              </Link>
            ) : (
              <Link href="/auth" className="text-sm font-medium text-accent hover:text-accent-hover">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* bottom nav — mobile only; desktop uses the top header nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-around px-4 py-1.5">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 text-[10px] ${
                active(t.href) ? "text-accent" : "text-dim hover:text-muted"
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="font-medium">{t.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
