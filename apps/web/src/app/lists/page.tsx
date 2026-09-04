"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/lib/useToast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListPlus, Lock, Pencil, Plus, Trash2, Users } from "lucide-react";
import { del, get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, plural } from "@/lib/format";
import { MobileHeader } from "@/components/Nav";
import Confirm from "@/components/Confirm";
import Modal from "@/components/Modal";
import { EditListSheet } from "@/components/EditListSheet";
import type { CollectionSummary } from "@/lib/types";
import { Toast } from "@/components/Toast";
import { LoadError } from "@/components/LoadError";

export default function ListsPage() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [lists, setLists] = useState<CollectionSummary[]>([]);
  /* Otherwise a dropped request renders "No lists yet — create your first",
     which invites someone with twenty lists to start over. */
  const [failed, setFailed] = useState(false);
  const [myLists, setMyLists] = useState<CollectionSummary[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("top");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CollectionSummary | null>(null);
  /** The list the confirm dialog is asking about. */
  const [doomed, setDoomed] = useState<CollectionSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const { toast, setToast } = useToast();

  const loadPublic = useCallback(() => {
    setFailed(false);
    get<{ results: CollectionSummary[] }>(`/lists?sort=${sort}&q=${encodeURIComponent(q)}`)
      .then((d) => setLists(d.results))
      .catch(() => setFailed(true));
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
  const destroy = async () => {
    const l = doomed;
    if (!l) return;
    setBusy(l.id);
    try {
      await del(`/lists/${l.id}`);
      setLists((prev) => prev.filter((x) => x.id !== l.id));
      setMyLists((prev) => prev.filter((x) => x.id !== l.id));
      setDoomed(null);
      setToast(`Deleted “${l.name}”`);
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
          <Plus size={14} /> New list
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
          <div className="dark-panel dark-panel--pad-sm">
            {myLists.map((l) => (
              <div key={l.id} className="list-row">
                <Link href={`/lists/detail?id=${l.id}`} className="list-row__link">
                  <ListPlus size={16} className="rating" />
                  <span className="list-row__name">{l.name}</span>
                  <span className="muted list-row__meta">
                    {l.visibility} · {plural(l.itemCount, "course")} · edited {formatDate(l.updatedAt)}
                  </span>
                </Link>
                <button
                  className="icon-btn"
                  title="Rename or change visibility"
                  aria-label={`Edit ${l.name}`}
                  onClick={() => setEditing(l)}
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="icon-btn"
                  title="Delete list"
                  aria-label={`Delete ${l.name}`}
                  disabled={busy === l.id}
                  onClick={() => setDoomed(l)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {failed ? (
        <div style={{ marginTop: 30 }}>
          <LoadError title="We couldn't load the collections" onRetry={loadPublic} />
        </div>
      ) : lists.length === 0 ? (
        <div className="dark-panel dark-panel--pad-xl" style={{ textAlign: "center", marginTop: 30 }}>
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
        <div className="lists-grid">
          {lists.map((l) => (
            <div key={l.id} className="list-card">
              <Link href={`/lists/detail?id=${l.id}`} className="dark-panel dark-panel--pad" style={{ display: "block" }}>
                <div className="list-card__strip">
                  {l.covers.slice(0, 3).map((c, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={c} alt="" className="h-full w-full rounded-md object-cover" loading="lazy" />
                  ))}
                  {l.covers.length === 0 && [0, 1, 2].map((i) => <div key={i} style={{ borderRadius: "var(--r-2xs)", background: "linear-gradient(135deg, hsl(32 42% 18%), hsl(20 50% 9%))" }} />)}
                </div>
                <h3 style={{ margin: "16px 0 7px", fontSize: 14 }}>{l.name}</h3>
                {l.description && <p className="muted" style={{ fontSize: 11 }}>{l.description}</p>}
                <div className="card-meta">
                  <span>by {l.ownerName ?? "—"}</span>
                  <span style={{ marginLeft: "auto" }}>{plural(l.itemCount, "course")} · {plural(l.savesCount, "save")}</span>
                </div>
              </Link>
              {/* Sits outside the <Link>: a button nested in an anchor is invalid
                  markup, and every click would navigate before it fired. */}
              {mine(l) && (
                <div className="list-card__owner">
                  <button
                    className="icon-btn"
                    title="Rename or change visibility"
                    aria-label={`Edit ${l.name}`}
                    onClick={() => setEditing(l)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Delete list"
                    aria-label={`Delete ${l.name}`}
                    disabled={busy === l.id}
                    onClick={() => setDoomed(l)}
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
        <Modal
          open
          onClose={() => setShowCreate(false)}
          title="New learning list"
          subtitle="Give the list a clear destination."
          width={480}
          footer={
            <div className="sheet-foot__row">
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="button" className="btn primary btn--grow" disabled={!name.trim()} onClick={createList}>
                Create list
              </button>
            </div>
          }
        >
          <label className="field-label" htmlFor="new-list-name">Name</label>
          <input id="new-list-name" className="form-input" placeholder="e.g. Build my first product" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="field-label" htmlFor="new-list-desc">Description</label>
          <textarea id="new-list-desc" className="form-input" rows={3} placeholder="What belongs in this list? (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="pills" style={{ marginTop: 14 }}>
            <button type="button" className={`badge ${visibility === "private" ? "primary" : ""}`} onClick={() => setVisibility("private")} aria-pressed={visibility === "private"}>
              <Lock size={11} /> Private
            </button>
            <button type="button" className={`badge ${visibility === "public" ? "primary" : ""}`} onClick={() => setVisibility("public")} aria-pressed={visibility === "public"}>
              <Users size={11} /> Public
            </button>
          </div>
        </Modal>
      )}

      <Confirm
        open={!!doomed}
        onClose={() => setDoomed(null)}
        title={`Delete “${doomed?.name ?? "this list"}”?`}
        body="The list and its ordering go. Every course in it stays in the catalogue."
        confirmLabel="Delete list"
        onConfirm={destroy}
      />

      <Toast message={toast} />
    </main>
  );
}
