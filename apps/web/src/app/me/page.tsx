"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { get, post } from "@/lib/api";
import type { UserProfile } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export default function MePage() {
  const { user, token, isPremium, logout, refresh } = useAuth();
  const router = useRouter();
  const [telegram, setTelegram] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!token) router.push("/auth?next=/me");
  }, [token, router]);

  const linkTelegram = async () => {
    try {
      await post("/auth/link-telegram", { telegramUsername: telegram });
      setToast("Telegram linked — bot downloads will sync here");
      await refresh();
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const terminateAll = async () => {
    try {
      await post("/users/sessions/terminate-all");
      setToast("All other sessions terminated");
      await refresh();
    } catch (e: any) {
      setToast(e.message);
    }
  };

  if (!token || !user) return null;

  const stats: [string, number][] = [
    ["ENROLLED", user.stats.enrolled],
    ["COMPLETED", user.stats.completed],
    ["SAVED", user.stats.saved],
    ["LIKED", user.stats.liked],
    ["LISTS", user.stats.lists],
    ["REVIEWS", user.stats.reviews],
  ];

  return (
    <div className="pb-6">
      {/* header */}
      <div className="border-b border-border px-4 py-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface-raised text-2xl font-bold text-accent">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            user.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="mt-2 text-lg font-bold text-text">
          {user.name} {user.isVerified && <span className="text-accent">✓</span>}
        </div>
        <div className="text-xs text-muted">@{user.username} · Member since {formatDate(user.memberSince)}</div>
      </div>

      {/* stat grid */}
      <div className="grid grid-cols-3 gap-px border-b border-border bg-border">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-bg px-2 py-3 text-center">
            <div className="text-lg font-bold text-text">{value}</div>
            <div className="text-[10px] uppercase tracking-wide text-dim">{label}</div>
          </div>
        ))}
      </div>

      {/* plan banner */}
      <div className="mx-4 mt-4 rounded-lg border border-border bg-surface p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-dim">Current plan</div>
        <div className="mt-1 flex items-center justify-between">
          <div>
            <span className={`text-base font-bold ${isPremium ? "text-accent" : "text-text"}`}>
              {isPremium ? "Premium" : "Free"}
            </span>
            {user.planExpiresAt && isPremium && (
              <div className="text-[11px] text-muted">active until {formatDate(user.planExpiresAt)}</div>
            )}
          </div>
          {!isPremium && (
            <Link href="/premium" className="rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-black">
              Go Premium
            </Link>
          )}
        </div>
        {!isPremium && (
          <p className="mt-2 text-[11px] text-muted">
            Browsing, lists and tracking are yours. Streaming and full-speed downloads are Premium.
          </p>
        )}
      </div>

      {/* shortcuts */}
      <div className="mx-4 mt-4 space-y-1">
        {[
          ["📚", "My Learning", "/my-learning"],
          ["🗂️", "My Lists", "/lists"],
          ["⭐", "Premium plans", "/premium"],
        ].map(([icon, label, href]) => (
          <Link key={href} href={href} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:bg-surface-hover">
            <span>{icon}</span>
            <span className="text-sm text-text">{label}</span>
            <span className="ml-auto text-dim">&gt;</span>
          </Link>
        ))}
        {user.isStaff && (
          <Link href="/admin" className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 hover:bg-accent/10">
            <span>🛠️</span>
            <span className="text-sm text-text">Admin CMS</span>
            <span className="ml-auto text-dim">&gt;</span>
          </Link>
        )}
      </div>

      {/* settings */}
      <div className="mx-4 mt-4 rounded-lg border border-border bg-surface p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-dim">Link Telegram</div>
        <p className="mt-1 text-[11px] text-muted">Link your Telegram to track your bot downloads here.</p>
        <div className="mt-2 flex gap-2">
          <input
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            placeholder={user.telegramUsername ? `@${user.telegramUsername}` : "@username or t.me link"}
            className="flex-1 rounded-full border border-border bg-bg px-3 py-2 text-xs text-text placeholder:text-dim focus:border-accent focus:outline-none"
          />
          <button onClick={linkTelegram} className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-black">
            {user.telegramUsername ? "Update" : "Continue"}
          </button>
        </div>
        {user.telegramUsername && (
          <div className="mt-1.5 text-[11px] text-success">✓ Linked to @{user.telegramUsername}</div>
        )}
      </div>

      {/* sessions */}
      <div className="mx-4 mt-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-dim">Sessions</div>
          {user.sessions.length > 1 && (
            <button onClick={terminateAll} className="text-[11px] font-medium text-danger">
              Terminate All
            </button>
          )}
        </div>
        <div className="mt-2 space-y-1.5">
          {user.sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded bg-bg px-3 py-2 text-xs">
              <span className="text-muted">{s.device ?? "Device"} {s.active && <span className="text-success">· Active now</span>}</span>
              <span className="text-[10px] text-dim">{s.ip ?? "—"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-4 mt-4">
        <button onClick={logout} className="w-full rounded-full border border-danger/40 py-2 text-sm font-medium text-danger hover:bg-danger/10">
          Log out
        </button>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-fit rounded-full bg-surface-raised px-4 py-2 text-xs text-text shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
