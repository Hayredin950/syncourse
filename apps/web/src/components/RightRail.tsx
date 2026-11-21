"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { APP_BUILDS, APP_WEB_URL } from "@/lib/apps";

export function RightRail() {
  const { isPremium } = useAuth();

  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col gap-4 overflow-y-auto px-4 py-5 lg:flex">
      {/* Current plan */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-dim">Current Plan</div>
        <div className="mt-1 text-lg font-bold text-text">{isPremium ? "Premium" : "Free"}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Browsing, lists and tracking are yours. Premium courses and resources need a pass.
        </p>
        {!isPremium && (
          <Link
            href="/premium"
            className="mt-3 block rounded-full bg-accent py-2 text-center text-sm font-bold text-black hover:bg-accent-hover"
          >
            Go Premium
          </Link>
        )}
        <ul className="mt-3 space-y-1.5 text-xs text-muted">
          <li>🎓 Every premium course</li>
          <li>📥 Offline lessons in the app</li>
          <li>🏅 Certificates for finished courses</li>
          <li>✨ Early lesson drops + bigger AI quota</li>
        </ul>
      </div>

      {/* Get the app */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-dim">Get the App</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {APP_BUILDS.map((build) => (
            <Link
              key={build.id}
              href="/download"
              className="rounded-md bg-surface-raised px-2 py-1 text-[11px] text-muted transition-colors hover:text-text"
            >
              {build.os}
            </Link>
          ))}
          <a
            href={APP_WEB_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-surface-raised px-2 py-1 text-[11px] text-muted transition-colors hover:text-text"
          >
            Web
          </a>
        </div>
        <Link href="/download" className="mt-3 block text-xs text-accent hover:underline">
          Download the app →
        </Link>
      </div>

      <a href="mailto:support@syncourse.app" className="text-xs text-muted transition-colors hover:text-text">
        Contact support
      </a>

      <div className="mt-auto border-t border-border pt-3">
        <div className="flex gap-3 text-[11px] text-dim">
          <Link href="/legal/terms" className="hover:text-muted">Terms of Service</Link>
          <Link href="/legal/privacy" className="hover:text-muted">Privacy Policy</Link>
          <Link href="/legal/refund" className="hover:text-muted">Refund Policy</Link>
        </div>
        <div className="mt-2 text-[11px] text-dim">Made with ❤️ by the Syncourse Team · © 2026</div>
      </div>
    </aside>
  );
}
