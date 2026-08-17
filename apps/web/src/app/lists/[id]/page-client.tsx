"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/lib/useToast";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";

// Static export: real list URLs are served at runtime via the SPA fallback (_redirects).
export async function generateStaticParams() {
  return [{ id: "public" }];
}

interface ListDetail {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  savesCount: number;
  itemCount: number;
  ownerName: string;
  createdAt: string;
  items: {
    id: string;
    title: string;
    slug: string;
    thumbnailUrl: string | null;
    ratingAvg: number;
    ratingCount: number;
    level: string;
  }[];
}

export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [list, setList] = useState<ListDetail | null>(null);
  const [saved, setSaved] = useState(false);
  const { toast, setToast } = useToast();

  useEffect(() => {
    get<ListDetail>(`/lists/${id}`).then(setList).catch(() => setToast("List not found"));
  }, [id]);

  const save = async () => {
    if (!token) {
      router.push("/auth?next=/lists/" + id);
      return;
    }
    try {
      const r = await post<{ saved: boolean }>(`/lists/${id}/save`);
      setSaved(r.saved);
      setList((l) => (l ? { ...l, savesCount: l.savesCount + (r.saved ? 1 : -1) } : l));
      setToast(r.saved ? "List saved" : "List unsaved");
    } catch (e: any) {
      setToast(e.message);
    }
  };

  if (!list) return <div className="p-4 text-center text-sm text-muted">Loading list…</div>;

  return (
    <div className="pb-6">
      <div className="border-b border-border px-4 py-3">
        <div className="text-[11px] uppercase tracking-wide text-dim">by {list.ownerName}</div>
        <h1 className="text-lg font-bold text-text">{list.name}</h1>
        {list.description && <p className="mt-1 text-sm text-muted">{list.description}</p>}
        <div className="mt-2 flex items-center gap-3 text-[11px] text-dim">
          <span>{list.itemCount} contents</span>
          <span>·</span>
          <span>{list.savesCount} saves</span>
          <span>·</span>
          <span>Last edited {formatDate(list.createdAt)}</span>
        </div>
        <button
          onClick={save}
          className={`mt-3 rounded-full px-4 py-1.5 text-xs font-bold ${saved ? "bg-accent-soft text-accent" : "bg-accent text-black"}`}
        >
          {saved ? "✓ Saved" : "Save list"}
        </button>
      </div>

      {list.items.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Nothing here. This collection is empty." />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
          {list.items.map((c) => (
            <Link key={c.id} href={`/courses/${c.slug}`} className="group min-w-0">
              <div className="aspect-[2/3] overflow-hidden rounded-lg bg-surface">
                {c.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbnailUrl} alt={c.title} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                ) : null}
              </div>
              <div className="mt-1 line-clamp-1 min-w-0 text-xs text-text">{c.title}</div>
              <div className="text-[10px] text-muted">★ {c.ratingAvg.toFixed(1)} · {c.level}</div>
            </Link>
          ))}
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
