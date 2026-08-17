"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Settings, CircleUserRound } from "lucide-react";
import { get, post } from "@/lib/api";
import type { UserProfile } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { MobileHeader } from "@/components/Nav";

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
    <main className="page">
      <MobileHeader title="Me" />
      <div className="profile-head">
        <div className="profile-row">
          <div className="avatar">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-full w-full rounded-[20px] object-cover" />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="display" style={{ fontSize: 32, marginBottom: 7 }}>{user.name} {user.isVerified && <Check size={16} className="rating" style={{ display: "inline" }} />}</h1>
            <p className="muted mono" style={{ margin: 0, fontSize: 11 }}>@{user.username} · Member since {formatDate(user.memberSince)}</p>
          </div>
        </div>
        <Link href="/me" className="btn"><Settings size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Edit profile</Link>
      </div>

      <div className="stats">
        {stats.map(([label, value]) => (
          <div className="stat" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* premium banner */}
      <div className="dark-panel recommend">
        <div>
          <span className="eyebrow">Current plan · {isPremium ? "Premium" : "Free"}</span>
          <h3 style={{ margin: "7px 0 0" }}>
            {isPremium ? "You&apos;re all in." : "Keep browsing. Learn without the limits."}
          </h3>
          <p>
            {isPremium
              ? user.planExpiresAt ? `Active until ${formatDate(user.planExpiresAt)}.` : "Full-speed downloads, offline notes, uninterrupted previews."
              : "Full-speed downloads, offline notes, and uninterrupted previews are part of Premium."}
          </p>
        </div>
        {!isPremium && (
          <Link href="/premium" className="btn primary">
            Go Premium <ArrowRight size={13} style={{ display: "inline", verticalAlign: "middle" }} />
          </Link>
        )}
      </div>

      {/* shortcuts */}
      <div className="rail">
        <div className="section-head"><h2>Your library</h2></div>
        <div className="dark-panel">
          <Link href="/my-learning" className="lesson"><span>📚</span><span>My Learning</span><span className="muted" style={{ marginLeft: "auto" }}>›</span></Link>
          <Link href="/lists" className="lesson"><span>🗂️</span><span>My Lists</span><span className="muted" style={{ marginLeft: "auto" }}>›</span></Link>
          <Link href="/premium" className="lesson"><span>⭐</span><span>Premium plans</span><span className="muted" style={{ marginLeft: "auto" }}>›</span></Link>
          {user.isStaff && (
            <Link href="/admin" className="lesson"><span>🛠️</span><span>Admin CMS</span><span className="muted" style={{ marginLeft: "auto" }}>›</span></Link>
          )}
        </div>
      </div>

      {/* telegram */}
      <div className="rail">
        <div className="section-head"><h2>Telegram delivery</h2></div>
        <div className="dark-panel" style={{ padding: 18 }}>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>Link your Telegram to track your bot downloads here.</p>
          <div className="actions">
            <input
              className="form-input"
              style={{ flex: 1, margin: 0 }}
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder={user.telegramUsername ? `@${user.telegramUsername}` : "@username or t.me link"}
            />
            <button className="btn primary" onClick={linkTelegram}>
              {user.telegramUsername ? "Update" : "Continue"}
            </button>
          </div>
          {user.telegramUsername && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#6fe0a4" }}>✓ Linked to @{user.telegramUsername}</div>
          )}
        </div>
      </div>

      {/* sessions */}
      <div className="rail">
        <div className="section-head">
          <h2>Sessions</h2>
          {user.sessions.length > 1 && (
            <button className="btn ghost" style={{ padding: 0, fontSize: 11 }} onClick={terminateAll}>
              Terminate all
            </button>
          )}
        </div>
        <div className="dark-panel" style={{ padding: 8 }}>
          {user.sessions.map((s) => (
            <div className="lesson" key={s.id}>
              <Check size={15} className="rating" />
              <span>
                {s.device ?? "Device"}
                <br />
                <small className="muted">{s.active ? "Active now" : "Signed out"} · {s.ip ?? "—"}</small>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rail">
        <button className="btn" style={{ width: "100%", color: "hsl(var(--destructive))" }} onClick={logout}>
          Log out
        </button>
      </div>

      {toast && (
        <div className="sheet" style={{ pointerEvents: "none", background: "transparent", display: "grid", placeItems: "end center", paddingBottom: 40 }}>
          <div className="dark-panel" style={{ padding: "14px 22px", background: "#f6a437", color: "#211308", fontWeight: 800, fontSize: 12 }}>
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}
