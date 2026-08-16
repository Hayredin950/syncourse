"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { EmptyState } from "@/components/EmptyState";
import { formatDate } from "@/lib/format";

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
  const [toast, setToast] = useState("");

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
    <div className="pb-6">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-text">Lists</h1>
          <button onClick={() => setShowCreate(true)} className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-black">
            + New List
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search lists or creators"
            className="flex-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text placeholder:text-dim focus:border-accent focus:outline-none"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-full border border-border bg-surface px-2 py-1.5 text-xs text-muted focus:outline-none"
          >
            <option value="top">Top voted</option>
            <option value="most-saved">Most saved</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {token && myLists.length > 0 && (
        <div className="px-4 pt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">My lists</div>
          <div className="space-y-2">
            {myLists.map((l) => (
              <div key={l.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="text-sm font-semibold text-text">{l.name}</div>
                <div className="text-[11px] text-dim">
                  {l.visibility} · {l.itemCount} items · edited {formatDate(l.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 p-4">
        {lists.length === 0 && <EmptyState title="No lists found" body="Try a different search." />}
        {lists.map((l) => (
          <Link key={l.id} href={`/lists/${l.id}`} className="overflow-hidden rounded-lg border border-border bg-surface hover:bg-surface-hover">
            {l.covers.length > 0 && (
              <div className="flex h-20 gap-0.5 overflow-hidden">
                {l.covers.map((c, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={c} alt="" className="h-full flex-1 object-cover" loading="lazy" />
                ))}
                {l.covers.length === 1 && <div className="flex-1 bg-surface-raised" />}
              </div>
            )}
            <div className="p-3">
              <div className="line-clamp-1 text-sm font-semibold text-text">{l.name}</div>
              {l.description && <div className="mt-0.5 line-clamp-2 text-xs text-muted">{l.description}</div>}
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-dim">
                <span>by {l.ownerName ?? "—"}</span>
                <span>·</span>
                <span>{l.itemCount} contents</span>
                <span>·</span>
                <span>{l.savesCount} saves</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-[420px] rounded-t-2xl border-t border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-text">New List</h2>
            <label className="mt-3 block text-xs font-medium text-muted">NAME</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Backend Roadmap 2026"
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-dim focus:border-accent focus:outline-none"
            />
            <label className="mt-3 block text-xs font-medium text-muted">DESCRIPTION (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What belongs in this list?"
              className="mt-1 w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-dim focus:border-accent focus:outline-none"
              rows={2}
            />
            <div className="mt-3 flex gap-2">
              {(
                [
                  ["private", "Private", "Only you can see this list."],
                  ["public", "Public", "Anyone can find and save this list."],
                ] as const
              ).map(([v, label, hint]) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={`flex-1 rounded-lg border p-2 text-left ${visibility === v ? "border-accent bg-accent-soft" : "border-border"}`}
                >
                  <div className="text-xs font-semibold text-text">{label}</div>
                  <div className="text-[10px] text-dim">{hint}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 rounded-full border border-border py-2 text-sm text-muted hover:text-text">
                Cancel
              </button>
              <button onClick={createList} className="flex-1 rounded-full bg-accent py-2 text-sm font-bold text-black disabled:opacity-40" disabled={!name.trim()}>
                Create list
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-fit rounded-full bg-surface-raised px-4 py-2 text-xs text-text shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
