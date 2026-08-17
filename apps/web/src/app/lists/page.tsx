"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/lib/useToast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListPlus, Plus, X } from "lucide-react";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { MobileHeader } from "@/components/Nav";

interface ListRow {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  savesCount: number;
  itemCount: number;
  ownerName: string | null;
  ownerUsername: string | null;
  createdAt: string;
  covers: string[];
}

export default function ListsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [lists, setLists] = useState<ListRow[]>([]);
  const [myLists, setMyLists] = useState<ListRow[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("top");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const { toast, setToast } = useToast();

  useEffect(() => {
    get<{ results: ListRow[] }>(`/lists?sort=${sort}&q=${encodeURIComponent(q)}`).then((d) => setLists(d.results)).catch(() => {});
  }, [q, sort]);

  useEffect(() => {
    if (token) get<ListRow[]>("/me/lists").then(setMyLists).catch(() => {});
  }, [token, showCreate]);

  const createList = async () => {
    if (!token) {
      router.push("/auth?next=/lists");
      return;
    }
    if (!name.trim()) return;
    try {
      await post("/lists", { name, description, visibility });
      setShowCreate(false);
      setName("");
      setDescription("");
      setToast("List created");
    } catch (e: any) {
      setToast(e.message);
    }
  };

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
              <Link key={l.id} href={`/lists/${l.id}`} className="lesson">
                <ListPlus size={16} className="rating" />
                <span>{l.name}</span>
                <span className="muted" style={{ marginLeft: "auto" }}>
                  {l.visibility} · {l.itemCount} items · {formatDate(l.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {lists.length === 0 && !q ? (
        <div className="dark-panel" style={{ padding: 40, textAlign: "center", marginTop: 30 }}>
          <ListPlus size={28} className="rating" />
          <h3>No lists yet</h3>
          <p className="muted">Create your first list to organize the courses you want next.</p>
          <button className="btn primary" onClick={() => setShowCreate(true)}>Create a list</button>
        </div>
      ) : (
        <div className="grid" style={{ marginTop: 28, gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
          {lists.map((l) => (
            <Link key={l.id} href={`/lists/${l.id}`} className="dark-panel" style={{ padding: 16, display: "block" }}>
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
          ))}
        </div>
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
