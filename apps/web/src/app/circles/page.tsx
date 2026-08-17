"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Plus, Search, Star, Users, X } from "lucide-react";
import { get, post } from "@/lib/api";
import type { ActivityFeed, CircleDetail, CircleLite } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { compact, formatDate } from "@/lib/format";
import { MobileHeader } from "@/components/Nav";

type Pane = "activity" | "circle";

export default function CirclesPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [pane, setPane] = useState<Pane>("activity");
  const [circles, setCircles] = useState<CircleLite[]>([]);
  const [selected, setSelected] = useState<CircleDetail | null>(null);
  const [feed, setFeed] = useState<ActivityFeed | null>(null);
  const [q, setQ] = useState("");
  const [toast, setToast] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

  const loadCircles = () => {
    get<CircleLite[]>("/circles").then(setCircles).catch(() => undefined);
  };

  useEffect(() => {
    loadCircles();
    if (token) get<ActivityFeed>("/activity").then(setFeed).catch(() => undefined);
  }, [token]);

  const openCircle = async (id: string) => {
    setPane("circle");
    get<CircleDetail>(`/circles/${id}`).then(setSelected).catch(() => undefined);
  };

  const toggleJoin = async (c: CircleLite | CircleDetail) => {
    if (!token) {
      router.push("/auth?next=/circles");
      return;
    }
    try {
      await post(c.joined ? `/circles/${c.id}/leave` : `/circles/${c.id}/join`);
      setCircles((prev) => prev.map((x) => (x.id === c.id ? { ...x, joined: !x.joined, memberCount: x.memberCount + (x.joined ? -1 : 1) } : x)));
      setSelected((prev) => (prev && prev.id === c.id ? { ...prev, joined: !prev.joined } : prev));
      flash(c.joined ? "Left circle" : "Joined circle 🎉");
      loadCircles();
    } catch (e: any) {
      flash(e.message ?? "Could not update membership");
    }
  };

  const createCircle = async () => {
    if (!token) {
      router.push("/auth?next=/circles");
      return;
    }
    if (!newName.trim()) return;
    try {
      const c = await post<CircleDetail>("/circles", { name: newName, description: newDesc });
      setCreating(false);
      setNewName("");
      setNewDesc("");
      setSelected(c);
      setPane("circle");
      loadCircles();
      flash("Circle created 🎉");
    } catch (e: any) {
      flash(e.message ?? "Could not create circle");
    }
  };

  const filtered = circles.filter(
    (c) => c.name.toLowerCase().includes(q.toLowerCase()) || (c.description ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <main className="page">
      <MobileHeader title="Circles" />
      <span className="eyebrow">Study circles</span>
      <h1 className="display" style={{ fontSize: 42 }}>Learn in public.<br />Keep the signal.</h1>

      {/* working pills — drive the right pane */}
      <div className="pills" style={{ margin: "18px 0 22px" }}>
        <button className={`badge ${pane === "activity" ? "primary" : ""}`} onClick={() => setPane("activity")}>
          Activity
        </button>
        <button className={`badge ${pane === "circle" ? "primary" : ""}`} onClick={() => setPane("circle")}>
          Circles
        </button>
      </div>

      {/* two-pane layout: sidebar + content (phonofilm) */}
      <div className="circles-layout">
        {/* left sidebar */}
        <aside className="circles-side">
          <div className="circle-search">
            <Search size={13} />
            <input placeholder="Search circles…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn primary" style={{ width: "100%", margin: "10px 0 16px" }} onClick={() => setCreating(true)}>
            <Plus size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Start your first circle
          </button>
          <div className="circle-list">
            {filtered.map((c) => (
              <button
                key={c.id}
                className={`circle-item ${pane === "circle" && selected?.id === c.id ? "active" : ""}`}
                onClick={() => openCircle(c.id)}
              >
                <span className="icon-badge icon-badge--amber"><Users size={14} /></span>
                <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</strong>
                  <small className="muted">{c.memberCount} members</small>
                </span>
                {c.joined && <span className="rating" style={{ fontSize: 10 }}>✓</span>}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="muted" style={{ fontSize: 11, padding: "10px 4px" }}>No circles match “{q}”.</p>
            )}
          </div>
        </aside>

        {/* right content pane */}
        <section className="circles-content">
          {pane === "activity" ? (
            <ActivityPane feed={feed} token={!!token} onGoCircles={() => setPane("circle")} />
          ) : selected ? (
            <CirclePane circle={selected} onToggleJoin={() => toggleJoin(selected)} />
          ) : (
            <div className="dark-panel" style={{ padding: 32, textAlign: "center" }}>
              <div className="empty-icon" style={{ fontSize: 28 }}>🛋️</div>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>Pick a circle from the list to see who's in it and what they're learning.</p>
            </div>
          )}
        </section>
      </div>

      {/* create-circle modal */}
      {creating && (
        <div className="sheet" onClick={() => setCreating(false)}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <h2>Start your first circle</h2>
              <button className="icon-btn" onClick={() => setCreating(false)} aria-label="Close"><X size={15} /></button>
            </div>
            <label className="muted" style={{ fontSize: 11, display: "block", margin: "14px 0 6px" }}>NAME</label>
            <input className="form-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Full-Stack Study Group" />
            <label className="muted" style={{ fontSize: 11, display: "block", margin: "14px 0 6px" }}>DESCRIPTION</label>
            <textarea className="form-input" rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What will this circle study together?" />
            <button className="btn primary" style={{ width: "100%", marginTop: 16 }} onClick={createCircle} disabled={!newName.trim()}>
              Create circle
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="sheet" style={{ pointerEvents: "none", background: "transparent", display: "grid", placeItems: "end center", paddingBottom: 40 }}>
          <div className="dark-panel" style={{ padding: "14px 22px", background: "#f6a437", color: "#211308", fontWeight: 800, fontSize: 12 }}>{toast}</div>
        </div>
      )}
    </main>
  );
}

function ActivityPane({ feed, token, onGoCircles }: { feed: ActivityFeed | null; token: boolean; onGoCircles: () => void }) {
  if (!token) {
    return (
      <div className="dark-panel" style={{ padding: 32, textAlign: "center" }}>
        <UsersIcon />
        <h3>Follow people to see what they are learning.</h3>
        <p className="muted" style={{ maxWidth: 380, margin: "0 auto 18px", fontSize: 12 }}>
          Your activity feed fills in as your circle grows — enrollments, reviews and progress from the people you follow.
        </p>
        <Link href="/auth?next=/circles" className="btn primary" style={{ display: "inline-block" }}>Sign in</Link>
      </div>
    );
  }
  if (!feed) {
    return <div className="dark-panel" style={{ padding: 32, textAlign: "center" }}><p className="muted">Loading your feed…</p></div>;
  }
  if (feed.items.length === 0) {
    return (
      <div className="dark-panel" style={{ padding: 32, textAlign: "center" }}>
        <UsersIcon />
        <h3>Your feed is quiet.</h3>
        <p className="muted" style={{ maxWidth: 380, margin: "0 auto 18px", fontSize: 12 }}>
          Follow {feed.followingCount > 0 ? "more people or join" : "people or join"} a circle to see their learning activity here.
        </p>
        <button className="btn primary" style={{ display: "inline-block" }} onClick={onGoCircles}>Browse circles</button>
      </div>
    );
  }
  return (
    <div className="dark-panel feed">
      <div className="section-head" style={{ padding: "14px 16px 8px", margin: 0 }}>
        <h2 style={{ fontSize: 15 }}>From your circles · {feed.items.length}</h2>
      </div>
      {feed.items.map((item) => (
        <div className="feed-item" key={item.type + item.id}>
          <span className="icon-badge icon-badge--gray" style={{ width: 32, height: 32 }}>
            {item.type === "review" ? <Star size={13} /> : <MessageCircle size={13} />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12 }}>
              <strong>{item.userName}</strong>{" "}
              <span className="muted">{item.type === "review" ? "reviewed" : "started"} </span>
              <Link href={`/courses/${item.course.slug}`} style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>{item.course.title}</Link>
            </div>
            {item.body && <p className="muted" style={{ fontSize: 11, margin: "4px 0 0", lineHeight: 1.5 }}>“{item.body}”</p>}
            <small className="muted mono" style={{ fontSize: 9 }}>{formatDate(item.createdAt)}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function CirclePane({ circle, onToggleJoin }: { circle: CircleDetail; onToggleJoin: () => void }) {
  return (
    <>
      <div className="dark-panel" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <span className="icon-badge icon-badge--amber" style={{ width: 44, height: 44 }}><Users size={18} /></span>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 20, margin: 0 }}>{circle.name}</h2>
            <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
              {circle.memberCount} members · owned by <strong>{circle.owner.name}</strong>
            </p>
            {circle.description && <p className="muted" style={{ fontSize: 12, margin: "10px 0 0", lineHeight: 1.6 }}>{circle.description}</p>}
          </div>
          <button className={`btn ${circle.joined ? "" : "primary"}`} onClick={onToggleJoin}>
            {circle.joined ? "Joined ✓" : "Join circle"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="section-head"><h2 style={{ fontSize: 15 }}>Members · {circle.members.length}</h2></div>
        <div className="avatar-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }}>
          {circle.members.map((m) => (
            <div className="avatar-cell" key={m.id}>
              <div className="avatar-sm">
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatarUrl} alt="" />
                ) : (
                  m.name.charAt(0)
                )}
              </div>
              <span className="avatar-name">{m.name}{m.role === "owner" ? " · owner" : ""}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="section-head"><h2 style={{ fontSize: 15 }}>Circle activity</h2></div>
        {circle.activity.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🌱</div>
            <p>No activity yet — members' reviews and enrollments will show up here.</p>
          </div>
        ) : (
          <div className="dark-panel feed">
            {circle.activity.map((item) => (
              <div className="feed-item" key={item.type + item.id}>
                <span className="icon-badge icon-badge--gray" style={{ width: 32, height: 32 }}>
                  {item.type === "review" ? <Star size={13} /> : <MessageCircle size={13} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12 }}>
                    <strong>{item.userName}</strong>{" "}
                    <span className="muted">{item.type === "review" ? "reviewed" : "started"} </span>
                    <Link href={`/courses/${item.course.slug}`} style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>{item.course.title}</Link>
                  </div>
                  {item.body && <p className="muted" style={{ fontSize: 11, margin: "4px 0 0", lineHeight: 1.5 }}>“{item.body}”</p>}
                  <small className="muted mono" style={{ fontSize: 9 }}>{formatDate(item.createdAt)}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function UsersIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--accent))" strokeWidth="1.8" style={{ marginBottom: 14 }}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
