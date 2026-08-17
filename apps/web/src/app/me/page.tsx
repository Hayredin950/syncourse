"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CreditCard,
  Library,
  LogOut,
  Save,
  Settings,
  Star,
  X,
} from "lucide-react";
import { get, patch, post } from "@/lib/api";
import type { UserProfile } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { MobileHeader } from "@/components/Nav";

type Tab = "library" | "stats" | "subscription" | "settings";

export default function MePage() {
  const { user, token, isPremium, logout, refresh } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("library");
  const [telegram, setTelegram] = useState("");
  const [toast, setToast] = useState("");

  // edit-profile modal state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) router.push("/auth?next=/me");
  }, [token, router]);

  const openEdit = () => {
    if (!user) return;
    setEditName(user.name);
    setEditGender(user.gender ?? "");
    setEditAvatar(user.avatarUrl ?? "");
    setEditing(true);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await patch("/users/me", {
        name: editName.trim() || undefined,
        gender: editGender.trim() || undefined,
        avatarUrl: editAvatar.trim() || undefined,
      });
      setEditing(false);
      setToast("Profile updated");
      await refresh();
    } catch (e: any) {
      setToast(e.message ?? "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

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

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "library", label: "Library", icon: <Library size={14} /> },
    { id: "stats", label: "Stats", icon: <BarChart3 size={14} /> },
    { id: "subscription", label: "Subscription", icon: <CreditCard size={14} /> },
    { id: "settings", label: "Settings", icon: <Settings size={14} /> },
  ];

  return (
    <main className="page">
      <MobileHeader title="Me" />

      {/* profile head */}
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
            <h1 className="display" style={{ fontSize: 32, marginBottom: 7 }}>
              {user.name} {user.isVerified && <Check size={16} className="rating" style={{ display: "inline" }} />}
            </h1>
            <p className="muted mono" style={{ margin: 0, fontSize: 11 }}>
              @{user.username} · Member since {formatDate(user.memberSince)}
            </p>
          </div>
        </div>
        <button className="btn" onClick={openEdit}>
          <Settings size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Edit profile
        </button>
      </div>

      {/* phonofilm-style tabs */}
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ============ LIBRARY ============ */}
      {tab === "library" && (
        <>
          <div className="rail">
            <div className="section-head">
              <h2>Your library</h2>
            </div>
            <div className="dark-panel">
              <Link href="/my-learning" className="lesson">
                <span>📚</span>
                <span>My Learning</span>
                <span className="muted" style={{ marginLeft: "auto" }}>›</span>
              </Link>
              <Link href="/lists" className="lesson">
                <span>🗂️</span>
                <span>My Lists</span>
                <span className="muted" style={{ marginLeft: "auto" }}>›</span>
              </Link>
              <Link href="/search?scope=watchlist" className="lesson">
                <span>🔖</span>
                <span>Watchlist</span>
                <span className="muted" style={{ marginLeft: "auto" }}>›</span>
              </Link>
            </div>
          </div>

          {/* premium banner */}
          <div className="dark-panel recommend">
            <div>
              <span className="eyebrow">Current plan · {isPremium ? "Premium" : "Free"}</span>
              <h3 style={{ margin: "7px 0 0" }}>
                {isPremium ? "You're all in." : "Keep browsing. Learn without the limits."}
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
        </>
      )}

      {/* ============ STATS ============ */}
      {tab === "stats" && (
        <div className="stats">
          {stats.map(([label, value]) => (
            <div className="stat" key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
          <div className="dark-panel recommend" style={{ gridColumn: "1 / -1" }}>
            <div>
              <span className="eyebrow">Completion rate</span>
              <h3 style={{ margin: "7px 0 0" }}>
                {user.stats.enrolled > 0
                  ? `${Math.round((user.stats.completed / user.stats.enrolled) * 100)}% of enrolled courses completed`
                  : "No courses enrolled yet"}
              </h3>
              <p className="muted" style={{ margin: "7px 0 0", fontSize: 12 }}>
                {user.stats.reviews} review{user.stats.reviews === 1 ? "" : "s"} written · {user.stats.lists} list{user.stats.lists === 1 ? "" : "s"} curated
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ============ SUBSCRIPTION ============ */}
      {tab === "subscription" && (
        <>
          <div className="rail">
            <div className="section-head">
              <h2>Subscription</h2>
            </div>
            <div className="dark-panel">
              <div className="lesson">
                <span>💳</span>
                <span>Plan</span>
                <span style={{ marginLeft: "auto" }} className={isPremium ? "rating" : "muted"}>
                  {isPremium ? "Premium" : "Free"}
                </span>
              </div>
              <div className="lesson">
                <span>📅</span>
                <span>Renews</span>
                <span className="muted" style={{ marginLeft: "auto" }}>
                  {isPremium && user.planExpiresAt ? formatDate(user.planExpiresAt) : "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="dark-panel recommend">
            <div>
              <span className="eyebrow">Current plan · {isPremium ? "Premium" : "Free"}</span>
              <h3 style={{ margin: "7px 0 0" }}>
                {isPremium ? "You're all in." : "Keep browsing. Learn without the limits."}
              </h3>
              <p>
                {isPremium
                  ? "Full-speed downloads, offline notes, and uninterrupted previews."
                  : "Full-speed downloads, offline notes, and uninterrupted previews are part of Premium."}
              </p>
            </div>
            {!isPremium && (
              <Link href="/premium" className="btn primary">
                Go Premium <ArrowRight size={13} style={{ display: "inline", verticalAlign: "middle" }} />
              </Link>
            )}
          </div>
        </>
      )}

      {/* ============ SETTINGS ============ */}
      {tab === "settings" && (
        <>
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

          {user.isStaff && (
            <div className="rail">
              <div className="section-head"><h2>Staff</h2></div>
              <div className="dark-panel">
                <Link href="/admin" className="lesson">
                  <span>🛠️</span>
                  <span>Admin CMS</span>
                  <span className="muted" style={{ marginLeft: "auto" }}>›</span>
                </Link>
              </div>
            </div>
          )}

          <div className="rail">
            <button className="btn" style={{ width: "100%", color: "hsl(var(--destructive))" }} onClick={logout}>
              <LogOut size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Log out
            </button>
          </div>
        </>
      )}

      {/* edit-profile modal */}
      {editing && (
        <div className="sheet" onClick={() => setEditing(false)}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <h2>Edit profile</h2>
              <button className="icon-btn" onClick={() => setEditing(false)} aria-label="Close">
                <X size={15} />
              </button>
            </div>
            <label className="muted" style={{ fontSize: 11, display: "block", margin: "14px 0 6px" }}>NAME</label>
            <input className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Your name" />
            <label className="muted" style={{ fontSize: 11, display: "block", margin: "14px 0 6px" }}>GENDER</label>
            <select className="form-input" value={editGender} onChange={(e) => setEditGender(e.target.value)}>
              <option value="">Prefer not to say</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-binary">Non-binary</option>
            </select>
            <label className="muted" style={{ fontSize: 11, display: "block", margin: "14px 0 6px" }}>AVATAR URL</label>
            <input className="form-input" value={editAvatar} onChange={(e) => setEditAvatar(e.target.value)} placeholder="https://… (image URL)" />
            <button className="btn primary" style={{ width: "100%", marginTop: 18 }} onClick={saveProfile} disabled={saving}>
              <Save size={14} style={{ display: "inline", verticalAlign: "middle" }} /> {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}

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
