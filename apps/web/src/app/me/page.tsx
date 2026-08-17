"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Bookmark,
  Check,
  ChevronRight,
  CreditCard,
  Eye,
  Heart,
  Library,
  LogOut,
  Mail,
  MessageCircle,
  Play,
  Save,
  Settings,
  X,
  Zap,
} from "lucide-react";
import { get, patch, post } from "@/lib/api";
import type { UserProfile, UserStats } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { MobileHeader } from "@/components/Nav";

type Tab = "library" | "stats" | "subscription" | "settings";

/* ---------------- small chart/panel helpers ---------------- */

function BarList({ rows, max }: { rows: { label: string; count: number }[]; max: number }) {
  if (rows.length === 0) {
    return <div className="muted" style={{ fontSize: 12, padding: "14px 0", textAlign: "center" }}>Fills in as you learn — nothing here yet.</div>;
  }
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bar-label">{r.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max((r.count / Math.max(max, 1)) * 100, 3)}%` }} />
          </div>
          <span className="bar-count">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

function MonthBars({ data }: { data: { month: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="month-bars">
      {data.map((d) => (
        <div className="mb-col" key={d.month} title={`${d.month}: ${d.count}`}>
          <div className={`mb-bar ${d.count === 0 ? "empty" : ""}`} style={{ height: `${Math.max((d.count / max) * 100, d.count > 0 ? 6 : 2)}%` }} />
          <span className="mb-label">{d.month.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <div className="ring-svg">
        <svg width="84" height="84">
          <circle cx="42" cy="42" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="7" />
          <circle
            cx="42" cy="42" r={r} fill="none"
            stroke="hsl(var(--accent))" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
          />
        </svg>
        <span className="ring-pct">{pct}%</span>
      </div>
      <h4>{label}</h4>
    </div>
  );
}

function PctBars({ rows }: { rows: { label: string; count: number; pct: number }[] }) {
  if (rows.length === 0) {
    return <div className="muted" style={{ fontSize: 12, padding: "14px 0", textAlign: "center" }}>Fills in as you learn — nothing here yet.</div>;
  }
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bar-label">{r.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${r.pct}%` }} />
          </div>
          <span className="bar-count">{r.pct}%</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- main page ---------------- */

export default function MePage() {
  const { user, token, loading, isPremium, logout, refresh } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("library");
  const [stats, setStats] = useState<UserStats | null>(null);
  const [telegram, setTelegram] = useState("");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  // edit-profile modal state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editAvatar, setEditAvatar] = useState("");

  // change-password modal
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");

  useEffect(() => {
    if (!loading && !token) router.push("/auth?next=/me");
  }, [loading, token, router]);

  useEffect(() => {
    if (token && tab === "stats" && !stats) {
      get<UserStats>("/users/me/stats").then(setStats).catch(() => undefined);
    }
  }, [token, tab, stats]);

  if (loading) {
    return (
      <main className="page" style={{ display: "grid", placeItems: "center", minHeight: 300 }}>
        <div className="muted mono">Loading…</div>
      </main>
    );
  }
  if (!token || !user) return null;

  const openEdit = () => {
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

  const saveSettings = async (patchBody: Record<string, unknown>) => {
    try {
      await patch("/users/me", patchBody);
      setToast("Saved");
      await refresh();
    } catch (e: any) {
      setToast(e.message ?? "Could not save");
    }
  };

  const toggleAutoplay = () => {
    const next = !(user.settings?.autoplayNext ?? false);
    void saveSettings({ settings: { ...(user.settings ?? {}), autoplayNext: next } });
  };

  const setPrivacy = (key: string, value: string) => {
    void saveSettings({ privacy: { ...(user.privacy ?? {}), [key]: value } });
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

  const unlinkGoogle = async () => {
    try {
      await post("/users/me/unlink-google");
      setToast("Google unlinked");
      await refresh();
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const changePassword = async () => {
    try {
      await post("/users/me/change-password", { currentPassword: pwCurrent, newPassword: pwNew });
      setPwOpen(false);
      setPwCurrent("");
      setPwNew("");
      setToast("Password updated");
      await refresh();
    } catch (e: any) {
      setToast(e.message ?? "Could not change password");
    }
  };

  const statsGrid: [string, number][] = [
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

  const privacyDefaults: { key: string; label: string; desc: string }[] = [
    { key: "watchHistory", label: "Watch history", desc: "Courses you've started or finished" },
    { key: "reviews", label: "Reviews", desc: "Your ratings and written reviews" },
    { key: "watchlist", label: "Watchlist", desc: "Courses you've saved" },
    { key: "likes", label: "Likes", desc: "Courses you've liked" },
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

      {/* stat grid */}
      <div className="stats">
        {statsGrid.map(([label, value]) => (
          <div className="stat" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
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
            <div className="section-head"><h2>Your library</h2></div>
            <div className="dark-panel">
              <Link href="/my-learning" className="lesson">
                <span>📚</span>
                <span>My Learning</span>
                <span className="muted" style={{ marginLeft: "auto" }}>›</span>
              </Link>
              <Link href="/premium" className="lesson">
                <span>⭐</span>
                <span>Premium plans</span>
                <span className="muted" style={{ marginLeft: "auto" }}>›</span>
              </Link>
            </div>
          </div>

          {/* activity row — phonofilm: Watchlist / Watched / Liked */}
          <div className="rail">
            <div className="section-head"><h2>Activity</h2></div>
            <div className="activity-row">
              <Link href="/search?scope=watchlist" className="activity-card">
                <span className="activity-icon"><Bookmark size={16} /></span>
                <span>
                  <strong>{user.stats.saved}</strong>
                  <span className="muted">Watchlist</span>
                </span>
                <ChevronRight size={15} style={{ marginLeft: "auto", color: "hsl(var(--muted-foreground))" }} />
              </Link>
              <Link href="/my-learning" className="activity-card">
                <span className="activity-icon"><Eye size={16} /></span>
                <span>
                  <strong>{user.stats.completed}</strong>
                  <span className="muted">Watched</span>
                </span>
                <ChevronRight size={15} style={{ marginLeft: "auto", color: "hsl(var(--muted-foreground))" }} />
              </Link>
              <Link href="/search?scope=liked" className="activity-card">
                <span className="activity-icon"><Heart size={16} /></span>
                <span>
                  <strong>{user.stats.liked}</strong>
                  <span className="muted">Liked</span>
                </span>
                <ChevronRight size={15} style={{ marginLeft: "auto", color: "hsl(var(--muted-foreground))" }} />
              </Link>
            </div>
          </div>

          {/* created — my lists */}
          <div className="rail">
            <div className="section-head"><h2>Created</h2></div>
            <div className="dark-panel">
              <Link href="/lists" className="lesson">
                <span>🗂️</span>
                <span>My Lists</span>
                <span className="muted" style={{ marginLeft: "auto" }}>{user.stats.lists} ›</span>
              </Link>
            </div>
          </div>

          {/* saved learning paths */}
          <div className="rail">
            <div className="section-head"><h2>Saved learning paths</h2></div>
            {stats && stats.pathProgress.length > 0 ? (
              <div className="dark-panel" style={{ padding: 8 }}>
                {stats.pathProgress.map((p) => (
                  <div className="lesson" key={p.id}>
                    <span>🛤️</span>
                    <span>
                      {p.title}
                      <br />
                      <small className="muted">{p.completed}/{p.total} courses · {p.pct}%</small>
                    </span>
                    <span className="muted" style={{ marginLeft: "auto" }}>›</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🗺️</div>
                <p>Paths you save will show up here — curated multi-course tracks that take you from zero to job-ready.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ============ STATS ============ */}
      {tab === "stats" && (
        <>
          {!stats ? (
            <div className="dark-panel" style={{ padding: 40, textAlign: "center" }}>
              <p className="muted">Loading your stats…</p>
            </div>
          ) : (
            <>
              {/* progress rings — curated paths */}
              <div className="rail">
                <div className="section-head"><h2>Curated path completion</h2></div>
                {stats.pathProgress.length > 0 ? (
                  <div className="rings">
                    {stats.pathProgress.map((p) => (
                      <Ring key={p.id} pct={p.pct} label={p.title} />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">🔄</div>
                    <p>Progress against curated learning paths fills in as you complete courses inside them.</p>
                  </div>
                )}
              </div>

              <div className="panel-grid">
                {/* your ratings */}
                <div className="stat-panel">
                  <h3>Your ratings</h3>
                  <BarList rows={stats.ratingDistribution.map((r) => ({ label: `${r.stars}★`, count: r.count }))} max={Math.max(...stats.ratingDistribution.map((r) => r.count), 1)} />
                </div>

                {/* learning rhythm */}
                <div className="stat-panel">
                  <h3>Your learning rhythm</h3>
                  <MonthBars data={stats.monthlyCompleted} />
                  <p className="muted" style={{ fontSize: 10, margin: "8px 0 0" }}>Courses completed per month</p>
                </div>

                {/* categories */}
                <div className="stat-panel">
                  <h3>Categories</h3>
                  <BarList rows={stats.categoryCounts} max={stats.categoryCounts[0]?.count ?? 1} />
                </div>

                {/* instructors */}
                <div className="stat-panel">
                  <h3>Instructors</h3>
                  <BarList rows={stats.instructorCounts} max={stats.instructorCounts[0]?.count ?? 1} />
                </div>

                {/* languages */}
                <div className="stat-panel">
                  <h3>Languages</h3>
                  <BarList rows={stats.languageCounts} max={stats.languageCounts[0]?.count ?? 1} />
                </div>

                {/* instructors avatar grid */}
                <div className="stat-panel">
                  <h3>Instructors you learn from most</h3>
                  {stats.topInstructors.length > 0 ? (
                    <div className="avatar-grid">
                      {stats.topInstructors.map((i) => (
                        <div className="avatar-cell" key={i.name}>
                          <div className="avatar-sm">
                            {i.photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={i.photoUrl} alt="" />
                            ) : (
                              i.name.charAt(0)
                            )}
                          </div>
                          <span className="avatar-name">{i.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: 12, textAlign: "center", padding: "14px 0" }}>Fills in as you learn.</div>
                  )}
                </div>

                {/* content type */}
                <div className="stat-panel">
                  <h3>What you learn <b>(by type)</b></h3>
                  <PctBars rows={stats.contentTypeBreakdown} />
                </div>

                {/* difficulty */}
                <div className="stat-panel">
                  <h3>By difficulty</h3>
                  <PctBars rows={stats.difficultyBreakdown} />
                </div>

                {/* your week */}
                <div className="stat-panel">
                  <h3>Your week</h3>
                  <MonthBars data={stats.yourWeek.map((d) => ({ month: d.day, count: d.count }))} />
                  <p className="muted" style={{ fontSize: 10, margin: "8px 0 0" }}>Activity by weekday</p>
                </div>

                {/* watchlist growth */}
                <div className="stat-panel">
                  <h3>Watchlist growth</h3>
                  <MonthBars data={stats.watchlistGrowth} />
                  <p className="muted" style={{ fontSize: 10, margin: "8px 0 0" }}>Courses saved per month</p>
                </div>

                {/* top tags */}
                <div className="stat-panel">
                  <h3>Top tags</h3>
                  <BarList rows={stats.topTags} max={stats.topTags[0]?.count ?? 1} />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ============ SUBSCRIPTION ============ */}
      {tab === "subscription" && (
        <>
          {/* plan status */}
          <div className="rail">
            <div className="section-head"><h2>Subscription</h2></div>
            <div className="dark-panel" style={{ padding: 18 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                {isPremium
                  ? <>You're on <strong className="rating">Premium</strong>{user.planExpiresAt ? ` until ${formatDate(user.planExpiresAt)}.` : "."} Browsing, lists, tracking, full-speed downloads and ad-free learning are all yours.</> 
                  : <>Browsing, lists and tracking are yours. <strong>Streaming, full-speed downloads and ad-free learning are Premium.</strong></>}
              </p>
            </div>
          </div>

          {/* pending payment banner */}
          {user.pendingPayment && (
            <div className="pending-banner">
              <div>
                <strong>Payment pending — {user.pendingPayment.planName.replace("_", " ")} via {user.pendingPayment.paymentMethod}</strong>
                <span className="muted">We're confirming your payment of {user.pendingPayment.amount} ETB. It usually takes a few minutes.</span>
              </div>
              <Link href="/premium" className="btn primary" style={{ whiteSpace: "nowrap" }}>
                Finish your payment <ArrowRight size={13} style={{ display: "inline", verticalAlign: "middle" }} />
              </Link>
            </div>
          )}

          {/* 3-feature comparison */}
          <div className="rail">
            <div className="section-head"><h2>What Premium unlocks</h2></div>
            <div className="activity-row">
              <div className="activity-card">
                <span className="activity-icon"><Play size={16} /></span>
                <span>
                  <strong>Stream instantly</strong>
                  <span className="muted">No waits, no queues</span>
                </span>
              </div>
              <div className="activity-card">
                <span className="activity-icon"><Zap size={16} /></span>
                <span>
                  <strong>Full-speed downloads</strong>
                  <span className="muted">Offline notes &amp; materials</span>
                </span>
              </div>
              <div className="activity-card">
                <span className="activity-icon"><Eye size={16} /></span>
                <span>
                  <strong>Zero ads</strong>
                  <span className="muted">Uninterrupted previews</span>
                </span>
              </div>
            </div>
            {!isPremium && (
              <Link href="/premium" className="btn primary" style={{ width: "100%", marginTop: 14 }}>
                Go Premium <ArrowRight size={13} style={{ display: "inline", verticalAlign: "middle" }} />
              </Link>
            )}
          </div>
        </>
      )}

      {/* ============ SETTINGS ============ */}
      {tab === "settings" && (
        <>
          {/* contact support */}
          <div className="rail">
            <div className="section-head"><h2>Support</h2></div>
            <div className="dark-panel" style={{ padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
              <span className="activity-icon" style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: "hsl(var(--accent) / .12)", color: "hsl(var(--accent))" }}>
                <MessageCircle size={16} />
              </span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 13 }}>Contact support</strong>
                <span className="muted" style={{ display: "block", fontSize: 11, marginTop: 2 }}>Questions about billing, accounts or a course? We reply within a day.</span>
              </div>
              <a href="mailto:support@syncourse.app" className="btn">Message support</a>
            </div>
          </div>

          {/* email block */}
          <div className="rail">
            <div className="section-head"><h2>Account</h2></div>
            <div className="dark-panel" style={{ padding: 8 }}>
              <div className="setting-row">
                <div className="setting-info">
                  <Mail size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 6, color: "hsl(var(--muted-foreground))" }} />
                  {user.email}
                  {user.isVerified ? <span className="rating" style={{ marginLeft: 8, fontSize: 11 }}>✓ Verified</span> : <span className="muted" style={{ marginLeft: 8, fontSize: 11 }}>Unverified</span>}
                  <span className="muted">Member since {formatDate(user.memberSince)}</span>
                </div>
              </div>
              <div className="setting-row">
                <div className="setting-info">
                  Sign-in provider
                  <span className="muted">
                    {user.hasGoogle && user.hasPassword ? "Google · Password" : user.hasPassword ? "Password" : "Google"} — {user.hasGoogle && user.hasPassword ? "both linked" : user.hasGoogle ? "Google only" : "Password only"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* sign-in methods */}
          <div className="rail">
            <div className="section-head"><h2>Sign-in methods</h2></div>
            <div className="dark-panel" style={{ padding: 8 }}>
              <div className="setting-row">
                <div className="setting-info">
                  Google
                  <span className="muted">{user.hasGoogle ? "Linked" : "Not linked"}</span>
                </div>
                {user.hasGoogle && (
                  <button className="btn ghost" style={{ padding: "7px 12px", fontSize: 11 }} onClick={unlinkGoogle}>Unlink</button>
                )}
              </div>
              <div className="setting-row">
                <div className="setting-info">
                  Password
                  <span className="muted">{user.hasPassword ? "Set" : "Not set — add one to sign in without Google"}</span>
                </div>
                <button className="btn" style={{ padding: "7px 12px", fontSize: 11 }} onClick={() => setPwOpen(true)}>
                  {user.hasPassword ? "Change" : "Set password"}
                </button>
              </div>
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

          {/* autoplay toggle */}
          <div className="rail">
            <div className="section-head"><h2>Playback</h2></div>
            <div className="dark-panel" style={{ padding: 8 }}>
              <div className="setting-row">
                <div className="setting-info">
                  Autoplay next lesson
                  <span className="muted">Automatically start the next lesson when one finishes</span>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={user.settings?.autoplayNext ?? false} onChange={toggleAutoplay} />
                  <span className="slider" />
                </label>
              </div>
              <div className="setting-row">
                <div className="setting-info">
                  Autoplay previews
                  <span className="muted">Play course trailers when browsing</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={user.settings?.previewAutoplay ?? false}
                    onChange={() => void saveSettings({ settings: { ...(user.settings ?? {}), previewAutoplay: !(user.settings?.previewAutoplay ?? false) } })}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>
          </div>

          {/* privacy */}
          <div className="rail">
            <div className="section-head"><h2>What can others see</h2></div>
            <div className="dark-panel" style={{ padding: 8 }}>
              {privacyDefaults.map((p) => (
                <div className="setting-row" key={p.key}>
                  <div className="setting-info">
                    {p.label}
                    <span className="muted">{p.desc}</span>
                  </div>
                  <select value={user.privacy?.[p.key] ?? "everyone"} onChange={(e) => setPrivacy(p.key, e.target.value)}>
                    <option value="everyone">Everyone</option>
                    <option value="friends">Friends only</option>
                    <option value="nobody">Only me</option>
                  </select>
                </div>
              ))}
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
                    <small className="muted">{s.active ? "Active now" : "Signed out"} · {s.ip ?? "—"} · {formatDate(s.createdAt)}</small>
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

      {/* change-password modal */}
      {pwOpen && (
        <div className="sheet" onClick={() => setPwOpen(false)}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <h2>{user.hasPassword ? "Change password" : "Set a password"}</h2>
              <button className="icon-btn" onClick={() => setPwOpen(false)} aria-label="Close">
                <X size={15} />
              </button>
            </div>
            {user.hasPassword && (
              <>
                <label className="muted" style={{ fontSize: 11, display: "block", margin: "14px 0 6px" }}>CURRENT PASSWORD</label>
                <input className="form-input" type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} placeholder="Current password" />
              </>
            )}
            <label className="muted" style={{ fontSize: 11, display: "block", margin: "14px 0 6px" }}>NEW PASSWORD</label>
            <input className="form-input" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} placeholder="Min 8 characters" />
            <button
              className="btn primary"
              style={{ width: "100%", marginTop: 18 }}
              onClick={changePassword}
              disabled={!pwNew || pwNew.length < 8 || (user.hasPassword && !pwCurrent)}
            >
              Save password
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
