"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useToast } from "@/lib/useToast";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { del, get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { CoursePickerSheet } from "@/components/CoursePickerSheet";
import { EditListSheet } from "@/components/EditListSheet";
import type { CollectionDetail } from "@/lib/types";

/**
 * One collection, at /lists/detail?id=…
 *
 * The id is a query parameter, not a route segment, because the site is a static
 * export: /lists/[id] only exists for the ids `generateStaticParams()` saw at
 * build time — public lists, and only the first page of them. A list you just
 * created 404'd, which took its own Edit and Delete controls with it. One
 * exported page that reads ?id= resolves any list, private ones included.
 */
export default function ListDetailPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center text-sm text-muted">Loading list…</div>}>
      <ListDetail />
    </Suspense>
  );
}

function ListDetail() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { token } = useAuth();
  const [list, setList] = useState<CollectionDetail | null>(null);
  const [gone, setGone] = useState(false);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast, setToast } = useToast();

  const flash = useCallback(
    (m: string) => {
      setToast(m);
      setTimeout(() => setToast(""), 2400);
    },
    [setToast],
  );

  // Re-runs when the token arrives: `isOwner` and `saved` are per-viewer, so a
  // list fetched before auth hydrated would render without its owner controls.
  const load = useCallback(() => {
    if (!id) {
      setGone(true);
      return;
    }
    get<CollectionDetail>(`/lists/${id}`)
      .then(setList)
      .catch(() => setGone(true));
  }, [id]);

  useEffect(load, [load, token]);

  const save = async () => {
    if (!token) {
      router.push(`/auth?next=${encodeURIComponent(`/lists/detail?id=${id}`)}`);
      return;
    }
    try {
      const r = await post<{ saved: boolean }>(`/lists/${id}/save`);
      setList((l) => (l ? { ...l, saved: r.saved, savesCount: l.savesCount + (r.saved ? 1 : -1) } : l));
      flash(r.saved ? "List saved" : "List unsaved");
    } catch (e) {
      flash((e as Error).message);
    }
  };

  const addCourses = async (courseIds: string[]) => {
    setBusy(true);
    try {
      setList(await post<CollectionDetail>(`/lists/${id}/items`, { courseIds }));
      setPicking(false);
      flash(courseIds.length === 1 ? "Course added" : `${courseIds.length} courses added`);
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeCourse = async (courseId: string, title: string) => {
    try {
      setList(await del<CollectionDetail>(`/lists/${id}/items/${courseId}`));
      flash(`Removed ${title}`);
    } catch (e) {
      flash((e as Error).message);
    }
  };

  const destroy = async () => {
    if (!confirm("Delete this list? The courses stay in the catalogue.")) return;
    try {
      await del(`/lists/${id}`);
      router.push("/lists");
    } catch (e) {
      flash((e as Error).message);
    }
  };

  if (gone) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted">This list is private or no longer exists.</p>
        <Link href="/lists" className="btn primary mt-4 inline-block">All lists</Link>
      </div>
    );
  }
  if (!list) return <div className="p-4 text-center text-sm text-muted">Loading list…</div>;

  return (
    <div className="pb-6">
      <div className="border-b border-border px-4 py-3">
        <div className="text-[11px] uppercase tracking-wide text-dim">by {list.ownerName}</div>
        <h1 className="text-lg font-bold text-text">{list.name}</h1>
        {list.description && <p className="mt-1 text-sm text-muted">{list.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-dim">
          <span className="inline-flex items-center gap-1">
            {list.visibility === "public" ? <Users size={10} /> : <Lock size={10} />}
            {list.visibility}
          </span>
          <span>·</span>
          <span>{list.itemCount} {list.itemCount === 1 ? "course" : "courses"}</span>
          <span>·</span>
          <span>{list.savesCount} saves</span>
          <span>·</span>
          <span>Last edited {formatDate(list.updatedAt)}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {list.isOwner ? (
            <>
              <button className="btn primary" onClick={() => setPicking(true)}>
                <Plus size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Add courses
              </button>
              <button className="btn" onClick={() => setEditing(true)}>
                <Pencil size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Edit
              </button>
              <button className="btn" onClick={destroy}>
                <Trash2 size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Delete
              </button>
            </>
          ) : (
            <button
              onClick={save}
              className={`rounded-full px-4 py-1.5 text-xs font-bold ${list.saved ? "bg-accent-soft text-accent" : "bg-accent text-black"}`}
            >
              {list.saved ? "✓ Saved" : "Save list"}
            </button>
          )}
        </div>
      </div>

      {list.items.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title={
              list.isOwner
                ? "This list is empty — add courses from the catalogue."
                : "Nothing here. This collection is empty."
            }
          />
          {list.isOwner && (
            <div className="mt-3 text-center">
              <button className="btn primary" onClick={() => setPicking(true)}>Add your first course</button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
          {list.items.map((c) => (
            <div key={c.id} className="group relative min-w-0">
              <Link href={`/courses/${c.slug}`} className="block min-w-0">
                <div className="aspect-[2/3] overflow-hidden rounded-lg bg-surface">
                  {c.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumbnailUrl} alt={c.title} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  ) : null}
                </div>
                <div className="mt-1 line-clamp-1 min-w-0 text-xs text-text">{c.title}</div>
                <div className="text-[10px] text-muted">★ {c.ratingAvg.toFixed(1)} · {c.level}</div>
              </Link>
              {list.isOwner && (
                <button
                  onClick={() => removeCourse(c.id, c.title)}
                  aria-label={`Remove ${c.title}`}
                  title="Remove from list"
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1.5 text-text opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {picking && (
        <CoursePickerSheet
          already={list.items.map((i) => i.id)}
          busy={busy}
          onClose={() => setPicking(false)}
          onAdd={addCourses}
        />
      )}

      {editing && (
        <EditListSheet
          list={list}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setList(next);
            setEditing(false);
            flash("List updated");
          }}
          onError={flash}
        />
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-fit rounded-full bg-surface-raised px-4 py-2 text-xs text-text shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
