"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/lib/useToast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Loader2, Pencil, Plus, Search, Send, Star, Trash2, UserMinus, Users, X } from "lucide-react";
import { del, get, patch, post } from "@/lib/api";
import type { ActivityFeed, CircleDetail, CircleLite, CirclePost, CourseSummary } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { compact, formatDate } from "@/lib/format";
import { MobileHeader } from "@/components/Nav";
import { CoursePickerSheet } from "@/components/CoursePickerSheet";

type Pane = "activity" | "circle";

export default function CirclesPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [pane, setPane] = useState<Pane>("activity");
  const [circles, setCircles] = useState<CircleLite[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CircleDetail | null>(null);
  const [feed, setFeed] = useState<ActivityFeed | null>(null);
  const [q, setQ] = useState("");
  const { toast, setToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
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
    else setFeed(null);
  }, [token]);

  // Fetched off `openId` rather than in the click handler so the pane reloads when
  // the token lands: `joined`, `isOwner` and `canPost` are all per-viewer, and a
  // circle opened before auth hydrated would hide the composer from a member.
  useEffect(() => {
    if (!openId) return;
    let live = true;
    get<CircleDetail>(`/circles/${openId}`)
      .then((c) => live && setSelected(c))
      .catch(() => {
        if (!live) return;
        setSelected(null);
        // Nothing to edit if the detail never arrived; leaving the flag set would
        // pop the sheet open on the next circle opened.
        setEditing(false);
      });
    return () => {
      live = false;
    };
  }, [openId, token]);

  const openCircle = (id: string) => {
    setPane("circle");
    setOpenId(id);
  };

  const toggleJoin = async (c: CircleLite | CircleDetail) => {
    if (!token) {
      router.push("/auth?next=/circles");
      return;
    }
    try {
      await post(c.joined ? `/circles/${c.id}/leave` : `/circles/${c.id}/join`);
      flash(c.joined ? "Left circle" : "Joined circle 🎉");
      loadCircles();
      if (openId === c.id) get<CircleDetail>(`/circles/${c.id}`).then(setSelected).catch(() => undefined);
    } catch (e) {
      // The API refuses to let an owner leave — it would strand the circle — and
      // says so in the message, which is more useful than anything invented here.
      flash((e as Error).message);
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
      setOpenId(c.id);
      setPane("circle");
      loadCircles();
      flash("Circle created 🎉");
    } catch (e) {
      flash((e as Error).message);
    }
  };

  /**
   * Takes the circle rather than reading `selected`, because the sidebar deletes
   * circles that are not the one on screen — and a circle you regret starting
   * should not have to be opened first.
   */
  const destroyCircle = async (c: { id: string; name: string }) => {
    if (!confirm(`Delete “${c.name}”? Its wall and membership go with it.`)) return;
    setBusyId(c.id);
    try {
      await del(`/circles/${c.id}`);
      if (openId === c.id) {
        setSelected(null);
        setOpenId(null);
      }
      setCircles((prev) => prev.filter((x) => x.id !== c.id));
      flash("Circle deleted");
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  /** Sidebar Edit: open the circle, then let the sheet appear once detail lands. */
  const editCircle = (id: string) => {
    setPane("circle");
    setOpenId(id);
    setEditing(true);
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
            <Plus size={14} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
            {circles.length === 0 ? "Start your first circle" : "New circle"}
          </button>
          <div className="circle-list">
            {filtered.map((c) => (
              // The row is a button, so the owner controls sit beside it rather
              // than inside it — nested buttons never receive their own clicks.
              <div key={c.id} className={`circle-row ${c.isOwner ? "circle-row--own" : ""}`}>
                <button
                  className={`circle-item ${pane === "circle" && openId === c.id ? "active" : ""}`}
                  onClick={() => openCircle(c.id)}
                >
                  <span className="icon-badge icon-badge--amber"><Users size={14} /></span>
                  <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                    <strong style={{ display: "block", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</strong>
                    <small className="muted">
                      {compact(c.memberCount)} members · {compact(c.postCount)} posts
                    </small>
                  </span>
                  {c.isOwner ? (
                    <span className="muted" style={{ fontSize: 9, letterSpacing: ".06em" }}>YOURS</span>
                  ) : (
                    c.joined && <span className="rating" style={{ fontSize: 10 }}>✓</span>
                  )}
                </button>
                {c.isOwner && (
                  <span className="circle-row__actions">
                    <button
                      className="icon-btn"
                      style={{ padding: "5px 6px" }}
                      onClick={() => editCircle(c.id)}
                      aria-label={`Edit ${c.name}`}
                      title="Rename this circle"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      className="icon-btn"
                      style={{ padding: "5px 6px" }}
                      onClick={() => destroyCircle(c)}
                      disabled={busyId === c.id}
                      aria-label={`Delete ${c.name}`}
                      title="Delete this circle"
                    >
                      {busyId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </span>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="muted" style={{ fontSize: 11, padding: "10px 4px" }}>
                {circles.length === 0 ? "No circles yet — start one." : `No circles match “${q}”.`}
              </p>
            )}
          </div>
        </aside>

        {/* right content pane */}
        <section className="circles-content">
          {pane === "activity" ? (
            <ActivityPane feed={feed} token={!!token} onGoCircles={() => setPane("circle")} />
          ) : selected && selected.id === openId ? (
            <CirclePane
              key={selected.id}
              circle={selected}
              signedIn={!!token}
              onToggleJoin={() => toggleJoin(selected)}
              onEdit={() => setEditing(true)}
              onDestroy={() => destroyCircle(selected)}
              onChanged={(next) => {
                setSelected(next);
                loadCircles();
              }}
              onNeedAuth={() => router.push("/auth?next=/circles")}
              onFlash={flash}
            />
          ) : openId ? (
            <div className="dark-panel" style={{ padding: 32, textAlign: "center" }}>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>Opening circle…</p>
            </div>
          ) : (
            <div className="dark-panel" style={{ padding: 32, textAlign: "center" }}>
              <div className="empty-icon" style={{ fontSize: 28 }}>🛋️</div>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>Pick a circle from the list to see who&apos;s in it and what they&apos;re learning.</p>
            </div>
          )}
        </section>
      </div>

      {/* create-circle modal */}
      {creating && (
        <div className="sheet" onClick={() => setCreating(false)}>
          <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <h2>{circles.length === 0 ? "Start your first circle" : "Start a circle"}</h2>
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

      {editing && selected && selected.id === openId && (
        <EditCircleSheet
          circle={selected}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setSelected(next);
            setEditing(false);
            loadCircles();
            flash("Circle updated");
          }}
          onError={flash}
        />
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
          Your activity feed fills in as your circle grows — the courses and reviews of the people you follow.
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
            {item.type === "review" ? <Star size={13} /> : <Download size={13} />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12 }}>
              <strong>{item.userName}</strong>{" "}
              <span className="muted">{item.type === "review" ? "reviewed" : "downloaded"} </span>
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

/**
 * One circle: its header, its wall, its members, and the activity its members
 * generated elsewhere. The wall is the part that makes a circle a place rather
 * than a mirror — everything else here you could already see from the outside.
 *
 * Every mutation returns the whole refreshed detail from the API, so `onChanged`
 * replaces the circle in one go instead of this component patching counts by hand
 * and slowly drifting out of step with the server.
 */
function CirclePane({
  circle,
  signedIn,
  onToggleJoin,
  onEdit,
  onDestroy,
  onChanged,
  onNeedAuth,
  onFlash,
}: {
  circle: CircleDetail;
  signedIn: boolean;
  onToggleJoin: () => void;
  onEdit: () => void;
  onDestroy: () => void;
  onChanged: (next: CircleDetail) => void;
  onNeedAuth: () => void;
  onFlash: (message: string) => void;
}) {
  const [body, setBody] = useState("");
  const [attached, setAttached] = useState<CourseSummary | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    setPosting(true);
    try {
      onChanged(await post<CircleDetail>(`/circles/${circle.id}/posts`, { body: text, courseId: attached?.id }));
      setBody("");
      setAttached(null);
    } catch (e) {
      onFlash((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  const removePost = async (p: CirclePost) => {
    if (!confirm("Delete this post?")) return;
    setBusyId(p.id);
    try {
      onChanged(await del<CircleDetail>(`/circles/${circle.id}/posts/${p.id}`));
    } catch (e) {
      onFlash((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const kick = async (member: { id: string; name: string }) => {
    if (!confirm(`Remove ${member.name} from this circle?`)) return;
    setBusyId(member.id);
    try {
      onChanged(await del<CircleDetail>(`/circles/${circle.id}/members/${member.id}`));
      onFlash(`Removed ${member.name}`);
    } catch (e) {
      onFlash((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="dark-panel" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <span className="icon-badge icon-badge--amber" style={{ width: 44, height: 44 }}><Users size={18} /></span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ fontSize: 20, margin: 0 }}>{circle.name}</h2>
            <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
              {compact(circle.memberCount)} members · {compact(circle.postCount)} posts · owned by{" "}
              <strong>{circle.owner.name}</strong>
            </p>
            {circle.description && <p className="muted" style={{ fontSize: 12, margin: "10px 0 0", lineHeight: 1.6 }}>{circle.description}</p>}
          </div>
          {/* The owner is always a member, so Join/Leave would be a dead control for
              them — they get the controls that only they can use instead. */}
          {circle.isOwner ? (
            <div className="actions">
              <button className="btn" onClick={onEdit}>
                <Pencil size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Edit
              </button>
              <button className="btn" onClick={onDestroy}>
                <Trash2 size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Delete
              </button>
            </div>
          ) : (
            <button className={`btn ${circle.joined ? "" : "primary"}`} onClick={onToggleJoin}>
              {circle.joined ? "Joined ✓" : "Join circle"}
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="section-head"><h2 style={{ fontSize: 15 }}>Wall · {compact(circle.postCount)}</h2></div>

        {circle.canPost ? (
          <div className="dark-panel" style={{ padding: 14 }}>
            <textarea
              className="form-input"
              rows={3}
              maxLength={2000}
              placeholder={`Share something with ${circle.name}…`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {attached && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, padding: 8, borderRadius: 10, background: "rgba(255,255,255,.04)" }}>
                {attached.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attached.thumbnailUrl} alt="" style={{ width: 30, height: 44, borderRadius: 6, objectFit: "cover" }} />
                ) : (
                  <span className="icon-badge icon-badge--gray" style={{ width: 30, height: 44 }}><Star size={12} /></span>
                )}
                <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                  <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attached.title}</strong>
                  <small className="muted">recommended with this post</small>
                </span>
                <button className="icon-btn" onClick={() => setAttached(null)} aria-label="Remove course"><X size={13} /></button>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn ghost" onClick={() => setAttaching(true)}>
                <Plus size={13} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
                {attached ? "Change course" : "Recommend a course"}
              </button>
              <button className="btn primary" disabled={!body.trim() || posting} onClick={submit}>
                {posting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" style={{ display: "inline", verticalAlign: "middle" }} /> Posting…
                  </>
                ) : (
                  <>
                    <Send size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Post
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="dark-panel" style={{ padding: 18, textAlign: "center" }}>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              {signedIn ? "Join this circle to post on its wall." : "Sign in and join this circle to post on its wall."}
            </p>
            {!signedIn && (
              <button className="btn primary" style={{ marginTop: 12 }} onClick={onNeedAuth}>Sign in</button>
            )}
          </div>
        )}

        {circle.posts.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 12 }}>
            <div className="empty-icon">💬</div>
            <p>Nothing on the wall yet{circle.canPost ? " — say the first thing." : "."}</p>
          </div>
        ) : (
          <div className="dark-panel feed" style={{ marginTop: 12 }}>
            {circle.posts.map((p) => (
              <div className="feed-item" key={p.id}>
                <span className="avatar-sm" style={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", overflow: "hidden", background: "hsl(var(--accent) / .14)", color: "hsl(var(--accent))", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                  {p.author.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.author.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    p.author.name.charAt(0)
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12 }}>
                    <strong>{p.author.name}</strong>{" "}
                    <small className="muted mono" style={{ fontSize: 9 }}>{formatDate(p.createdAt)}</small>
                  </div>
                  {/* Posts are plain text, but the newlines people type are part of
                      what they wrote — collapsing them would reflow their words. */}
                  <p style={{ fontSize: 12, margin: "5px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{p.body}</p>
                  {p.course && (
                    <Link
                      href={`/courses/${p.course.slug}`}
                      style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, padding: 8, borderRadius: 10, background: "rgba(255,255,255,.04)" }}
                    >
                      {p.course.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.course.thumbnailUrl} alt="" style={{ width: 28, height: 40, borderRadius: 6, objectFit: "cover" }} />
                      ) : (
                        <span className="icon-badge icon-badge--gray" style={{ width: 28, height: 40 }}><Star size={11} /></span>
                      )}
                      <span style={{ minWidth: 0, fontSize: 12 }}>
                        <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.course.title}</strong>
                        <small className="muted">open course</small>
                      </span>
                    </Link>
                  )}
                </div>
                {p.canDelete && (
                  <button className="icon-btn" onClick={() => removePost(p)} disabled={busyId === p.id} aria-label="Delete post" title="Delete post">
                    {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="section-head"><h2 style={{ fontSize: 15 }}>Members · {circle.members.length}</h2></div>
        <div className="avatar-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }}>
          {circle.members.map((m) => (
            <div className="avatar-cell" key={m.id} style={{ position: "relative" }}>
              <div className="avatar-sm">
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatarUrl} alt="" />
                ) : (
                  m.name.charAt(0)
                )}
              </div>
              <span className="avatar-name" style={{ display: "block" }}>
                {m.name}{m.role === "owner" ? " · owner" : ""}
              </span>
              {circle.isOwner && m.role !== "owner" && (
                <button
                  className="icon-btn"
                  onClick={() => kick(m)}
                  disabled={busyId === m.id}
                  aria-label={`Remove ${m.name}`}
                  title={`Remove ${m.name}`}
                  style={{ position: "absolute", top: -2, right: -2, width: 22, height: 22 }}
                >
                  {busyId === m.id ? <Loader2 size={10} className="animate-spin" /> : <UserMinus size={10} />}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="section-head"><h2 style={{ fontSize: 15 }}>Circle activity</h2></div>
        {circle.activity.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🌱</div>
            <p>No activity yet — members&apos; reviews and downloads will show up here.</p>
          </div>
        ) : (
          <div className="dark-panel feed">
            {circle.activity.map((item) => (
              <div className="feed-item" key={item.type + item.id}>
                <span className="icon-badge icon-badge--gray" style={{ width: 32, height: 32 }}>
                  {item.type === "review" ? <Star size={13} /> : <Download size={13} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12 }}>
                    <strong>{item.userName}</strong>{" "}
                    <span className="muted">{item.type === "review" ? "reviewed" : "downloaded"} </span>
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

      {attaching && (
        <CoursePickerSheet
          single
          heading="Recommend a course"
          already={[]}
          onClose={() => setAttaching(false)}
          onAdd={(_ids, courses) => {
            setAttached(courses[0] ?? null);
            setAttaching(false);
          }}
        />
      )}
    </>
  );
}

function EditCircleSheet({
  circle,
  onClose,
  onSaved,
  onError,
}: {
  circle: CircleDetail;
  onClose: () => void;
  onSaved: (next: CircleDetail) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(circle.name);
  const [description, setDescription] = useState(circle.description ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      onSaved(await patch<CircleDetail>(`/circles/${circle.id}`, { name, description }));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="section-head" style={{ margin: 0 }}>
          <h2 style={{ fontSize: 16 }}>Edit circle</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <label className="muted" style={{ fontSize: 11, display: "block", margin: "14px 0 6px" }}>NAME</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="muted" style={{ fontSize: 11, display: "block", margin: "14px 0 6px" }}>DESCRIPTION</label>
        <textarea className="form-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!name.trim() || busy} onClick={submit}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
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
