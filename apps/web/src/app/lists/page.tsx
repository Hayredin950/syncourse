"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/lib/useToast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { del, get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { MobileHeader } from "@/components/Nav";
import { EditListSheet } from "@/components/EditListSheet";
import type { CollectionSummary } from "@/lib/types";

export default function ListsPage() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [lists, setLists] = useState<CollectionSummary[]>([]);
  const [myLists, setMyLists] = useState<CollectionSummary[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("top");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CollectionSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const { toast, setToast } = useToast();

  const loadPublic = useCallback(() => {
    get<{ results: CollectionSummary[] }>(`/lists?sort=${sort}&q=${encodeURIComponent(q)}`)
      .then((d) => setLists(d.results))
      .catch(() => {});
  }, [q, sort]);

  const loadMine = useCallback(() => {
    if (token) get<CollectionSummary[]>("/me/lists").then(setMyLists).catch(() => {});
    else setMyLists([]);
  }, [token]);

  useEffect(loadPublic, [loadPublic]);
  useEffect(loadMine, [loadMine, showCreate]);

  const createList = async () => {
    if (!token) {
      router.push("/auth?next=/lists");
      return;
    }
    if (!name.trim()) return;
    try {
      const created = await post<CollectionSummary>("/lists", { name, description, visibility });
      setShowCreate(false);
      setName("");
      setDescription("");
      // Straight into the new list: a name and a description on their own are an
      // empty shelf, and the picker that fills it lives on the detail page.
      router.push(`/lists/detail?id=${created.id}`);
    } catch (e) {
      setToast((e as Error).message);
    }
  };

  /** Deleting from the index, so a list you regret never has to be opened first. */
  const destroy = async (l: CollectionSummary) => {
    if (!confirm(`Delete “${l.name}”? The courses in it stay in the catalogue.`)) return;
    setBusy(l.id);
    try {
      await del(`/lists/${l.id}`);
      setLists((prev) => prev.filter((x) => x.id !== l.id));
      setMyLists((prev) => prev.filter((x) => x.id !== l.id));
      setToast(`Deleted “${l.name}”`);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // The public rows carry a username rather than an ownership flag, so this is
  // how the index knows which cards are yours to change.
  const mine = (l: CollectionSummary) => !!user?.username && l.ownerUsername === user.username;

  return (
    <main className="page">
      <MobileHeader title="Lists" />
      <div className="profile-head">
        <div>
          <span className="eyebrow">Collections</span>
          <h1 className="display" style={{ fontSize: 42 }}>Course lists</h1>
          <p className="muted" style={{ margin: 0 }}>Browse lists made by people who learn with intent.</p>
        </div>
        <button className="btn primary" onClick={() => setShowCreate(true)}>
          <Plus size={14} style={{ display: "inline", verticalAlign: "middle" }} /> New list
        </button>
      </div>

      <div className="filters">
        <input
          className="filter-search"
          placeholder="Search lists or creators"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="pills">
          {(["top", "most-saved", "newest"] as const).map((s) => (
            <button key={s} className={`badge ${sort === s ? "primary" : ""}`} onClick={() => setSort(s)}>
              {s === "top" ? "All topics" : s === "most-saved" ? "Top saved" : "Newest"}
            </button>
          ))}
        </div>
      </div>

      {token && myLists.length > 0 && (
        <section className="rail">
          <div className="section-head"><h2>My lists</h2></div>
          <div className="dark-panel" style={{ padding: 12 }}>
            {myLists.map((l) => (
              <div key={l.id} className="lesson">
                <Link
                  href={`/lists/detail?id=${l.id}`}
                  style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, color: "inherit" }}
                >
                  <ListPlus size={16} className="rating" />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                  <span className="muted" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
                    {l.visibility} · {l.itemCount} {l.itemCount === 1 ? "course" : "courses"} · edited {formatDate(l.updatedAt)}
                  </span>
                </Link>
                <button
                  className="icon-btn"
                  style={{ padding: "6px 8px" }}
                  title="Rename or change visibility"
                  aria-label={`Edit ${l.name}`}
                  onClick={() => setEditing(l)}
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="icon-btn"
                  style={{ padding: "6px 8px" }}
                  title="Delete list"
                  aria-label={`Delete ${l.name}`}
                  disabled={busy === l.id}
                  onClick={() => destroy(l)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {lists.length === 0 ? (
        <div className="dark-panel" style={{ padding: 40, textAlign: "center", marginTop: 30 }}>
          <ListPlus size={28} className="rating" />
          {q ? (
            <>
              <h3>No lists match “{q}”</h3>
              <p className="muted">Only public lists are searchable — your private ones are above.</p>
            </>
          ) : (
            <>
              <h3>No lists yet</h3>
              <p className="muted">Create your first list to organize the courses you want next.</p>
              <button className="btn primary" onClick={() => setShowCreate(true)}>Create a list</button>
            </>
          )}
        </div>
      ) : (
        <div className="grid" style={{ marginTop: 28, gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
          {lists.map((l) => (
            <div key={l.id} style={{ position: "relative" }}>
              <Link href={`/lists/detail?id=${l.id}`} className="dark-panel" style={{ padding: 16, display: "block" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4, height: 100 }}>
                  {l.covers.slice(0, 3).map((c, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={c} alt="" className="h-full w-full rounded-md object-cover" loading="lazy" />
                  ))}
                  {l.covers.length === 0 && [0, 1, 2].map((i) => <div key={i} style={{ borderRadius: 5, background: "linear-gradient(135deg, hsl(32 42% 18%), hsl(20 50% 9%))" }} />)}
                </div>
                <h3 style={{ margin: "16px 0 7px", fontSize: 14 }}>{l.name}</h3>
                {l.description && <p className="muted" style={{ fontSize: 11 }}>{l.description}</p>}
                <div className="card-meta">
                  <span>by {l.ownerName ?? "—"}</span>
                  <span style={{ marginLeft: "auto" }}>{l.itemCount} courses · {l.savesCount} saves</span>
                </div>
              </Link>
              {/* Sits outside the <Link>: a button nested in an anchor is invalid
                  markup, and every click would navigate before it fired. */}
              {mine(l) && (
                <div style={{ position: "absolute", top: 24, right: 24, display: "flex", gap: 6 }}>
                  <button
                    className="icon-btn"
                    style={{ padding: "6px 8px", background: "#0f0e0bdd" }}
                    title="Rename or change visibility"
                    aria-label={`Edit ${l.name}`}
                    onClick={() => setEditing(l)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="icon-btn"
                    style={{ padding: "6px 8px", background: "#0f0e0bdd" }}
                    title="Delete list"
                    aria-label={`Delete ${l.name}`}
                    disabled={busy === l.id}
                    onClick={() => destroy(l)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditListSheet
          list={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setToast("List updated");
            // Reload rather than patch in place: a rename changes the sort order
            // and flipping to private removes the card from the public grid.
            loadMine();
            loadPublic();
          }}
          onError={setToast}
        />
      )}

      {showCreate && (
        <div className="sheet" onClick={() => setShowCreate(false)}>
          <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h3>New learning list</h3>
              <button className="icon-btn" onClick={() => setShowCreate(false)}><X size={15} /></button>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Give the list a clear destination.</p>
            <input className="form-input" placeholder="e.g. Build my first product" value={name} onChange={(e) => setName(e.target.value)} />
            <textarea className="form-input" rows={3} placeholder="What belongs in this list? (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="pills" style={{ margin: "5px 0 18px" }}>
              <button className={`badge ${visibility === "private" ? "primary" : ""}`} onClick={() => setVisibility("private")}>
                <LockIcon /> Private
              </button>
              <button className={`badge ${visibility === "public" ? "primary" : ""}`} onClick={() => setVisibility("public")}>
                <UsersIcon /> Public
              </button>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn primary" disabled={!name.trim()} onClick={createList}>Create list</button>
            </div>
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

function LockIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
}
function UsersIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
