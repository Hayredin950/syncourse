"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/lib/useToast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Bookmark,
  Check,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  Gift,
  Heart,
  Layers,
  Library,
  LogOut,
  Mail,
  MessageCircle,
  Play,
  Save,
  Settings,
  Share2,
  ShieldCheck,
  Smartphone,
  Wrench,
  Zap,
} from "lucide-react";
import { apiUrl, get, getToken, patch, post } from "@/lib/api";
import type { UserProfile, UserStats } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import Modal from "@/components/Modal";
import { CoverImage } from "@/components/CoverImage";
import { MobileHeader } from "@/components/Nav";
import { SkCards, SkEntityPage } from "@/components/Skeleton";
import { LoadError } from "@/components/LoadError";
import { Toast } from "@/components/Toast";

type Tab = "library" | "stats" | "subscription" | "settings";

interface CertificateRow {
  serial: string;
  issuedAt: string;
  courseTitle: string;
  courseSlug: string;
  thumbnailUrl: string | null;
  verifyUrl: string;
}

interface ReceiptRow {
  id: string;
  planName: string;
  amount: number;
  currency: string;
  method: string;
  periodStart: string | null;
  periodEnd: string | null;
  reference: string | null;
  createdAt: string;
  number: string;
}

interface Perks {
  premiumActive: boolean;
  planExpiresAt: string | null;
  telegramRoomUrl: string | null;
  supportEmail: string;
  aiQuota: { free: number; premium: number };
  perks: { id: string; label: string; detail: string }[];
}

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
  /* The Stats tab renders its skeleton whenever `stats` is null, so a failed
     request used to shimmer there for as long as the tab stayed open. */
  const [statsFailed, setStatsFailed] = useState(false);
  const [telegram, setTelegram] = useState("");
  const { toast, setToast } = useToast();
  const [saving, setSaving] = useState(false);

  // edit-profile modal state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [uploading, setUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // change-password modal
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");

  // certificates, receipts and Premium perks (loaded with the tab)
  const [certs, setCerts] = useState<CertificateRow[] | null>(null);
  const [receipts, setReceipts] = useState<ReceiptRow[] | null>(null);
  const [perks, setPerks] = useState<Perks | null>(null);
  const [gift, setGift] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    if (!loading && !token) router.push("/auth?next=/me");
  }, [loading, token, router]);

  const loadStats = useCallback(() => {
    setStatsFailed(false);
    get<UserStats>("/users/me/stats")
      .then(setStats)
      .catch(() => setStatsFailed(true));
  }, []);

  useEffect(() => {
    if (token && tab === "stats" && !stats && !statsFailed) loadStats();
  }, [token, tab, stats, statsFailed, loadStats]);

  useEffect(() => {
    if (!token || tab !== "subscription") return;
    get<CertificateRow[]>("/certificates/me").then(setCerts).catch(() => setCerts([]));
    get<ReceiptRow[]>("/payments/receipts").then(setReceipts).catch(() => setReceipts([]));
    get<Perks>("/payments/perks").then(setPerks).catch(() => undefined);
  }, [token, tab]);

  if (loading) {
    return (
      <main className="page">
        <SkEntityPage label="Loading your profile" rows={3} />
      </main>
    );
  }
  if (!token) return null;
  // A token without a profile means the /users/me request failed (a dropped
  // connection, a 5xx). Returning null here left the whole page blank with no
  // explanation; offer the retry instead.
  if (!user) {
    return (
      <main className="page">
        <LoadError
          title="We couldn't load your profile"
          body="You are still signed in — the connection dropped on the way to our servers."
          onRetry={() => void refresh()}
        />
      </main>
    );
  }

  const onShareProfile = () => {
    if (navigator.share) {
      void navigator.share({ title: `${user?.name} on Syncourse`, url: window.location.href });
    } else {
      void navigator.clipboard?.writeText(window.location.href);
      setToast("Profile link copied");
    }
  };

  const openEdit = () => {
    setEditName(user.name);
    setEditUsername(user.username ?? "");
    setEditGender(user.gender ?? "");
    setEditAvatar(user.avatarUrl ?? "");
    setEditing(true);
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const r = await post<{ url: string }>("/images/upload", { dataUrl: reader.result });
          setEditAvatar(r.url);
          setToast("Image uploaded");
        } catch (e: any) {
          setToast(e.message ?? "Upload failed");
        } finally {
          setUploading(false);
        }
      };
    } catch {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await patch("/users/me", {
        name: editName.trim() || undefined,
        username: editUsername.trim().replace(/^@/, "") || undefined,
        gender: editGender.trim() || null,
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

  const downloadReceipt = async (r: ReceiptRow) => {
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl()}/api/payments/receipts/${r.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Could not build the receipt");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${r.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not download the receipt");
    }
  };

  const redeemCode = async () => {
    const code = gift.trim();
    if (!code) return;
    setRedeeming(true);
    try {
      const r = await post<{ redeemed: boolean; already: boolean; planExpiresAt: string }>("/payments/redeem", { code });
      setGift("");
      setToast(r.already ? "That code is already on this account" : "Gift code applied — Premium extended");
      await refresh();
      if (token) {
        get<Perks>("/payments/perks").then(setPerks).catch(() => undefined);
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : "That code could not be redeemed");
    } finally {
      setRedeeming(false);
    }
  };

  const statsGrid: [string, number][] = [
    ["DOWNLOADED", user.stats.downloaded],
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
    { key: "downloadHistory", label: "Download history", desc: "Courses you've downloaded" },
    { key: "reviews", label: "Reviews", desc: "Your ratings and written reviews" },
    { key: "watchlist", label: "Saved", desc: "Courses you've saved for later" },
    { key: "likes", label: "Likes", desc: "Courses you've liked" },
  ];

  return (
    <main className="page me-page">
      <MobileHeader title="Me" />

      {/* profile card — a smoky amber cover with the identity sitting on its
          lower edge, exactly the shape phono uses for YOUR PHONOFILM. */}
      <div className="profile-card">
        <div className="profile-cover">
          <span className="profile-kicker">Your Syncourse</span>
          <div className="profile-actions">
            <button className="profile-action" onClick={openEdit} title="Edit profile" aria-label="Edit profile">
              <Settings size={14} /> Edit
            </button>
            <button className="profile-action" onClick={onShareProfile} title="Share profile" aria-label="Share profile">
              <Share2 size={14} /> Share
            </button>
            {/* The console used to be a rail at the foot of Settings — behind a
                tab, below privacy switches, four screens down on a phone. It is
                the thing staff open most, so it sits with the other identity
                actions instead. */}
            {user.isStaff && (
              <Link href="/admin" className="profile-action" title="Admin console" aria-label="Admin console">
                <Wrench size={14} /> Admin
              </Link>
            )}
            {/* Sign out belongs here on every width, not just a phone: the top
                bar carries the Me menu on a desktop, but the only other copy was
                at the foot of Settings, behind a tab that scrolls off a 360px
                screen. One place, always reachable. */}
            <button
              className="profile-action profile-action--danger"
              title="Sign out"
              aria-label="Sign out"
              onClick={() => {
                logout();
                router.push("/");
              }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
        <div className="profile-head">
          <div className="profile-row">
            <div className="avatar">
              {/* Initial always, photo over it — see CoverImage. */}
              {(user.name || "?").charAt(0).toUpperCase()}
              <CoverImage src={user.avatarUrl} eager />
            </div>
            <div className="profile-id">
              <h1 className="display">
                {user.name} {user.isVerified && <Check size={16} className="rating" style={{ display: "inline" }} />}
              </h1>
              <p className="profile-meta">
                <span>@{user.username}</span>
                <span className="profile-meta__sep" aria-hidden>·</span>
                <span className="profile-meta__joined">Member since {formatDate(user.memberSince)}</span>
              </p>
            </div>
          </div>
        </div>
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

      {/* phonofilm-style tabs (pill container) */}
      <div className="profile-tabs" role="tablist">
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
            <div className="dark-panel dark-panel--rows">
              <Link href="/my-learning" className="lesson">
                <span className="icon-badge icon-badge--amber"><BookOpen size={15} /></span>
                <span className="lesson__main">
                  <span className="lesson__title">My Library</span>
                  <span className="lesson__sub">Everything you&apos;ve saved and downloaded</span>
                </span>
                <ChevronRight size={16} className="row-chevron" />
              </Link>
              <Link href="/certificates" className="lesson">
                <span className="icon-badge icon-badge--purple"><Award size={15} /></span>
                <span className="lesson__main">
                  <span className="lesson__title">Certificates</span>
                  <span className="lesson__sub">View, download or verify a certificate</span>
                </span>
                <ChevronRight size={16} className="row-chevron" />
              </Link>
              <Link href="/premium" className="lesson">
                <span className="icon-badge icon-badge--purple"><CreditCard size={15} /></span>
                <span className="lesson__main">
                  <span className="lesson__title">Premium plans</span>
                  <span className="lesson__sub">{isPremium ? "Active — manage your plan" : "Unlock every premium course and resource"}</span>
                </span>
                <ChevronRight size={16} className="row-chevron" />
              </Link>
            </div>
          </div>

          {/* activity row — phonofilm: Watchlist / Watched / Liked */}
          <div className="rail">
            <div className="section-head"><h2>Activity</h2></div>
            <div className="activity-row">
              {/* Was /search?scope=watchlist — /search has never read `scope`, so both
                  of these landed on an empty search box. */}
              <Link href="/my-learning?tab=saved" className="activity-card">
                <span className="activity-icon"><Bookmark size={16} /></span>
                <span>
                  <strong>{user.stats.saved}</strong>
                  <span className="muted">Saved</span>
                </span>
                <ChevronRight size={15} style={{ marginLeft: "auto", color: "hsl(var(--muted-foreground))" }} />
              </Link>
              <Link href="/my-learning?tab=downloaded" className="activity-card">
                <span className="activity-icon"><Download size={16} /></span>
                <span>
                  <strong>{user.stats.downloaded}</strong>
                  <span className="muted">Downloaded</span>
                </span>
                <ChevronRight size={15} style={{ marginLeft: "auto", color: "hsl(var(--muted-foreground))" }} />
              </Link>
              <Link href="/my-learning?tab=liked" className="activity-card">
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
            <div className="dark-panel dark-panel--rows">
              <Link href="/lists" className="lesson">
                <span className="icon-badge icon-badge--blue"><Layers size={15} /></span>
                <span className="lesson__main">
                  <span className="lesson__title">My Lists</span>
                  <span className="lesson__sub">{user.stats.lists} {user.stats.lists === 1 ? "list" : "lists"} built</span>
                </span>
                <ChevronRight size={16} className="row-chevron" />
              </Link>
            </div>
          </div>

          {/* native app builds — the footer that links here is desktop-only */}
          <div className="rail">
            <div className="section-head"><h2>Get the app</h2></div>
            <div className="dark-panel dark-panel--rows">
              <Link href="/download" className="lesson">
                <span className="icon-badge icon-badge--amber"><Smartphone size={15} /></span>
                <span className="lesson__main">
                  <span className="lesson__title">Syncourse for your device</span>
                  <span className="lesson__sub">Android APK · Windows · Linux · macOS</span>
                </span>
                <ChevronRight size={16} className="row-chevron" />
              </Link>
            </div>
          </div>

          {/* saved learning paths */}
          <div className="rail">
            <div className="section-head"><h2>Saved learning paths</h2></div>
            {stats && stats.pathProgress.length > 0 ? (
              <div className="dark-panel dark-panel--pad-xs">
                {stats.pathProgress.map((p) => (
                  <div className="lesson" key={p.id}>
                    <span>🛤️</span>
                    <span>
                      {p.title}
                      <br />
                      <small className="muted">{p.downloaded}/{p.total} courses · {p.pct}%</small>
                    </span>
                    <ChevronRight size={16} className="row-chevron" />
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
          {statsFailed ? (
            <LoadError title="We couldn't load your stats" onRetry={loadStats} />
          ) : !stats ? (
            <SkCards n={4} label="Loading your stats" />
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
                    <p>Progress against curated learning paths fills in as you download the courses inside them.</p>
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
                  <MonthBars data={stats.monthlyDownloads} />
                  <p className="muted" style={{ fontSize: 10, margin: "8px 0 0" }}>Courses downloaded per month</p>
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
                            {i.name.charAt(0)}
                            <CoverImage src={i.photoUrl} transform={{ width: 96, height: 96 }} alt={i.name} className="absolute inset-0 h-full w-full object-cover" />
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
            <div className="dark-panel dark-panel--pad">
              <p style={{ margin: 0, fontSize: 13 }}>
                {isPremium
                  ? <>You're on <strong className="rating">Premium</strong>{user.planExpiresAt ? ` until ${formatDate(user.planExpiresAt)}.` : "."} Every premium course, resource and download is open on this account.</> 
                  : <>Browsing, lists and tracking are yours. <strong>Premium courses, resources and their files need a pass.</strong></>}
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
                Finish your payment <ArrowRight size={13} />
              </Link>
            </div>
          )}

          {/* what Premium actually unlocks, read from the server */}
          <div className="rail">
            <div className="section-head"><h2>What Premium unlocks</h2></div>
            <div className="activity-row">
              {(perks?.perks ?? [
                { id: "offline", label: "Offline library", detail: "Download whole courses in the app." },
                { id: "certificates", label: "Certificates", detail: "A numbered certificate per finished course." },
                { id: "ai", label: "Bigger AI quota", detail: "A much larger daily assistant allowance." },
                { id: "early", label: "Early access", detail: "New drops reach you first." },
              ]).map((p) => (
                <div className="activity-card" key={p.id}>
                  <span className="activity-icon"><Zap size={16} /></span>
                  <span>
                    <strong>{p.label}</strong>
                    <span className="muted">{p.detail}</span>
                  </span>
                </div>
              ))}
            </div>
            {perks?.telegramRoomUrl && (
              <a href={perks.telegramRoomUrl} target="_blank" rel="noreferrer" className="btn" style={{ width: "100%", marginTop: 12 }}>
                <MessageCircle size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Open the Premium members&apos; room
              </a>
            )}
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Priority support: <a href={`mailto:${perks?.supportEmail ?? "support@syncourse.com"}`} style={{ textDecoration: "underline" }}>{perks?.supportEmail ?? "support@syncourse.com"}</a>
              {" "}· assistant allowance: {perks?.aiQuota.premium ?? 1000} questions/day on Premium.
            </p>
            {!isPremium && (
              <Link href="/premium" className="btn primary" style={{ width: "100%", marginTop: 14 }}>
                Go Premium <ArrowRight size={13} />
              </Link>
            )}
          </div>

          {/* certificates */}
          <div className="rail">
            <div className="section-head">
              <h2><Award size={16} style={{ display: "inline", verticalAlign: "middle" }} /> Certificates</h2>
              <Link href="/certificates" className="muted" style={{ fontSize: 11, textDecoration: "underline" }}>
                Verify a serial
              </Link>
            </div>
            {certs === null ? (
              <div className="dark-panel dark-panel--pad muted" style={{ fontSize: 12 }}>Loading your certificates…</div>
            ) : certs.length === 0 ? (
              <div className="dark-panel dark-panel--pad muted" style={{ fontSize: 12 }}>
                No certificates yet. Open a course, mark every lesson complete, then issue the
                certificate from the course page.
              </div>
            ) : (
              <div className="dark-panel dark-panel--rows">
                {certs.map((c) => (
                  <div className="lesson" key={c.serial}>
                    <span className="icon-badge icon-badge--amber"><Award size={15} /></span>
                    <span className="lesson__main">
                      <span className="lesson__title">{c.courseTitle}</span>
                      <span className="lesson__sub mono">{c.serial}</span>
                    </span>
                    <Link href={`/certificates/${c.serial}`} className="btn" style={{ fontSize: 11 }}>
                      View
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* receipts */}
          <div className="rail">
            <div className="section-head"><h2><FileText size={16} style={{ display: "inline", verticalAlign: "middle" }} /> Payment receipts</h2></div>
            {receipts === null ? (
              <div className="dark-panel dark-panel--pad muted" style={{ fontSize: 12 }}>Loading your receipts…</div>
            ) : receipts.length === 0 ? (
              <div className="dark-panel dark-panel--pad muted" style={{ fontSize: 12 }}>
                Receipts appear here after a payment is approved by the bank.
              </div>
            ) : (
              <div className="dark-panel dark-panel--rows">
                {receipts.map((r) => (
                  <div className="lesson" key={r.id}>
                    <span className="icon-badge icon-badge--amber"><FileText size={15} /></span>
                    <span className="lesson__main">
                      <span className="lesson__title">{r.number} · {r.planName}</span>
                      <span className="lesson__sub">
                        {r.amount.toLocaleString()} {r.currency} · {formatDate(r.createdAt)}
                      </span>
                    </span>
                    <button className="btn" style={{ fontSize: 11 }} onClick={() => void downloadReceipt(r)}>
                      <Download size={12} style={{ display: "inline", verticalAlign: "middle" }} /> PDF
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* gift code */}
          <div className="rail">
            <div className="section-head"><h2><Gift size={16} style={{ display: "inline", verticalAlign: "middle" }} /> Gift code</h2></div>
            <div className="dark-panel dark-panel--pad">
              <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                Got a pass from a friend or a promotion? Redeeming it extends Premium on this account.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  placeholder="SYN-XXXXXXXX"
                  value={gift}
                  onChange={(e) => setGift(e.target.value.toUpperCase())}
                  style={{ flex: 1 }}
                />
                <button className="btn primary" onClick={() => void redeemCode()} disabled={redeeming || gift.trim().length < 3}>
                  {redeeming ? "Checking…" : "Redeem"}
                </button>
              </div>
            </div>
          </div>

          <div className="rail">
            <div className="section-head"><h2>Certificate and receipt details</h2></div>
            <div className="dark-panel dark-panel--pad muted" style={{ fontSize: 11, lineHeight: 1.7 }}>
              <ShieldCheck size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Certificates record that you
              marked every lesson complete. They are not exams or accreditation. Receipts are issued for
              approved payments only and carry the bank reference.
            </div>
          </div>
        </>
      )}

      {/* ============ SETTINGS ============ */}
      {tab === "settings" && (
        <>
          {/* contact support */}
          <div className="rail">
            <div className="section-head"><h2>Support</h2></div>
            <div className="dark-panel dark-panel--pad" style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span className="activity-icon" style={{ width: 38, height: 38, borderRadius: "var(--r-sm)", display: "grid", placeItems: "center", background: "hsl(var(--accent) / .12)", color: "hsl(var(--accent))" }}>
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
            <div className="dark-panel dark-panel--pad-xs">
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
            <div className="dark-panel dark-panel--pad-xs">
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
            <div className="dark-panel dark-panel--pad">
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
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--success-ink)" }}>✓ Linked to @{user.telegramUsername}</div>
              )}
            </div>
          </div>

          {/* autoplay toggle */}
          <div className="rail">
            <div className="section-head"><h2>Playback</h2></div>
            <div className="dark-panel dark-panel--pad-xs">
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
            <div className="dark-panel dark-panel--pad-xs">
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

        </>
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(false)}
          title="Edit profile"
          subtitle="Your name and handle are what other members see."
          width={480}
          footer={
            <div className="sheet-foot__row">
              <button type="button" className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="button" className="btn primary btn--grow" onClick={saveProfile} disabled={saving || uploading}>
                <Save size={14} /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          }
        >
            <label className="field-label" htmlFor="me-name">Display name</label>
            <input id="me-name" className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Your name" />

            <label className="field-label" htmlFor="me-username">Username</label>
            <div className="input-prefix">
              <span className="input-prefix__at">@</span>
              <input
                id="me-username"
                className="form-input"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value.replace(/[^a-zA-Z0-9_@]/g, ""))}
                placeholder="your-handle"
                autoComplete="username"
              />
            </div>
            <p className="muted" style={{ fontSize: 11, margin: "4px 0 0" }}>
              Your profile URL will be /@{editUsername.replace(/^@/, "") || "your-handle"}
            </p>

            <label className="field-label">Profile image</label>
            <div className="avatar-upload-row">
              <div className="nav-me__avatar" style={{ width: 48, height: 48 }}>
                {editAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-bold text-accent">{(editName || "?").charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadAvatar(f);
                  }}
                />
                <button className="btn" onClick={() => avatarInputRef.current?.click()} disabled={uploading}>
                  {uploading ? "Uploading…" : "Upload image"}
                </button>
                <p className="muted" style={{ fontSize: 10, margin: "5px 0 0" }}>JPEG, PNG, WebP or GIF, up to 5MB.</p>
              </div>
            </div>

            <label className="field-label">Gender</label>
            <div className="segmented">
              {["", "Male", "Female", "Non-binary"].map((g) => (
                <button
                  key={g || "na"}
                  className={`segmented__opt ${editGender === g ? "active" : ""}`}
                  onClick={() => setEditGender(g)}
                >
                  {g || "Prefer not to say"}
                </button>
              ))}
            </div>

        </Modal>
      )}

      {pwOpen && (
        /* A real <form>, so the browser offers to save the new password and Enter
           submits it. Google-only accounts get "Set a password" and no current
           field — there is nothing to confirm against. */
        <Modal
          open
          onClose={() => setPwOpen(false)}
          title={user.hasPassword ? "Change password" : "Set a password"}
          subtitle={
            user.hasPassword
              ? "You stay signed in on this device."
              : "You signed in with Google. A password lets you in without it."
          }
          width={420}
        >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void changePassword();
              }}
            >
              {/* Password managers key on the username field to know which login
                  they are updating; hidden, because /me already knows who you are. */}
              <input type="hidden" name="username" autoComplete="username" value={user.username ?? user.email} />
              {user.hasPassword && (
                <>
                  <label className="field-label" htmlFor="pw-current">Current password</label>
                  <input
                    id="pw-current"
                    className="form-input"
                    type="password"
                    autoComplete="current-password"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    placeholder="Current password"
                  />
                </>
              )}
              <label className="field-label" htmlFor="pw-new">New password</label>
              <input
                id="pw-new"
                className="form-input"
                type="password"
                autoComplete="new-password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                placeholder="Min 8 characters"
              />
              <button
                type="submit"
                className="btn primary"
                style={{ width: "100%", marginTop: 18 }}
                disabled={!pwNew || pwNew.length < 8 || (user.hasPassword && !pwCurrent)}
              >
                Save password
              </button>
            </form>
        </Modal>
      )}

      <Toast message={toast} />
    </main>
  );
}
