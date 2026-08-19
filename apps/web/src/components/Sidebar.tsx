"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/browse", label: "Browse", icon: "🗂️" },
  { href: "/search", label: "Search", icon: "🔍" },
  { href: "/circles", label: "circles", icon: "⭕" },
  { href: "/lists", label: "Collections", icon: "📋" },
  { href: "/my-learning", label: "My Learning", icon: "📚" },
  { href: "/me", label: "Me", icon: "👤" },
];

const typeTabs = [
  { label: "All", type: "" },
  { label: "Courses", type: "course" },
  { label: "Mini-courses", type: "mini-course" },
  { label: "Cheat-sheets", type: "cheat-sheet" },
  { label: "Roadmaps", type: "roadmap" },
];

export function Sidebar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { user, isPremium } = useAuth();

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col overflow-y-auto border-r border-border px-3 py-4 lg:flex">
      <Link href="/" className="px-2 text-lg font-bold tracking-tight text-text">
        Syncourse<span className="text-accent">.</span>
      </Link>

      <nav className="mt-5 flex flex-col gap-0.5">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors ${
              active(l.href) ? "bg-surface font-medium text-text" : "text-muted hover:bg-surface-hover hover:text-text"
            }`}
          >
            <span className="w-5 text-center text-base leading-none">{l.icon}</span>
            <span>{l.label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-6 border-t border-border pt-4">
        <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-dim">Content</div>
        <div className="flex flex-col gap-0.5">
          {typeTabs.map((t) => {
            const href = t.type ? `/browse?type=${t.type}` : "/browse";
            return (
              <Link
                key={t.label}
                href={href}
                className={`rounded-lg px-2 py-1.5 text-xs transition-colors ${
                  t.type && pathname === "/browse" && params.get("type") === t.type
                    ? "font-medium text-accent"
                    : "text-muted hover:text-text"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-auto pt-4">
        {user ? (
          <Link href="/me" className="flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-semibold text-accent">{(user.name || "?").charAt(0).toUpperCase()}</span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text">{user.name}</span>
              <span className="block text-[11px] text-dim">@{user.username || (user.name ? user.name.toLowerCase().replace(/\s+/g, "") : "user")}</span>
            </span>
          </Link>
        ) : (
          <Link
            href="/auth"
            className="block rounded-full bg-accent py-2 text-center text-sm font-bold text-black hover:bg-accent-hover"
          >
            Sign in
          </Link>
        )}
        {!isPremium && (
          <Link
            href="/premium"
            className="mt-2 block rounded-full border border-accent/60 py-2 text-center text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
          >
            Free-Upgrade
          </Link>
        )}
      </div>
    </aside>
  );
}
