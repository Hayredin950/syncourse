"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/lib/useToast";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Bookmark, Check, Layers, Lock, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { del, get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, plural } from "@/lib/format";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { CourseCard } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";
import { SkCards, SkHero } from "@/components/Skeleton";
import { CoursePickerSheet } from "@/components/CoursePickerSheet";
import Confirm from "@/components/Confirm";
import { EditListSheet } from "@/components/EditListSheet";
import type { CollectionDetail, CollectionItemRow, CourseSummary } from "@/lib/types";
import { Toast } from "@/components/Toast";

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
    <Suspense
      fallback={
        <main className="page">
          <SkCards n={6} label="Loading the collection" />
        </main>
      }
    >
      <ListDetail />
    </Suspense>
  );
}

/**
 * A collection row carries less than a catalogue row does, so the rest is filled
 * in rather than left undefined: `CourseCard` is the same card the whole site
 * uses and a collection has no business rendering a different one. The `?? 0`
 * defaults matter because the API that sends these fields deploys separately
 * from this build.
 */
function asSummary(c: CollectionItemRow): CourseSummary {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    description: c.description ?? "",
    thumbnailUrl: c.thumbnailUrl,
    level: c.level,
    durationMin: c.durationMin ?? 0,
    lessonCount: c.lessonCount ?? 0,
    ratingAvg: c.ratingAvg,
    ratingCount: c.ratingCount,
    downloadCount: c.downloadCount ?? 0,
    isPremium: c.isPremium ?? false,
    isFeatured: false,
    contentType: c.contentType ?? "course",
    categoryNames: [],
    lecturerName: c.lecturerNames?.[0] ?? null,
    lecturerNames: c.lecturerNames ?? [],
    organizationName: null,
    publishedAt: c.addedAt,
  };
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
  const [doomed, setDoomed] = useState(false);
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
    await del(`/lists/${id}`);
    router.push("/lists");
  };

  // Up to four covers fan out behind the title. Fewer than four is fine — they
  // stretch to fill; none at all leaves the panel's own gradient, which is why
  // there is no placeholder art here.
  const art = useMemo(
    () => (list?.items ?? []).map((i) => i.thumbnailUrl).filter(Boolean).slice(0, 4) as string[],
    [list],
  );

  if (gone) {
    return (
      <main className="page">
        <MobileHeader title="Collection" />
        <div className="empty-state" style={{ marginTop: 30 }}>
          <div className="empty-icon">🔒</div>
          <p>This collection is private or no longer exists.</p>
          <Link href="/lists" className="btn primary" style={{ display: "inline-block", marginTop: 14 }}>
            Browse collections
          </Link>
        </div>
      </main>
    );
  }

  if (!list) {
    return (
      <main className="page">
        <MobileHeader title="Collection" />
        <SkHero label="Loading the collection" />
      </main>
    );
  }

  return (
    <main className="page">
      <MobileHeader title="Collection" />

      <Link href="/lists" className="back-btn">
        <ArrowLeft size={14} /> Collections
      </Link>

      <header className="col-hero">
        {art.length > 0 && (
          <div className="col-hero__art" aria-hidden>
            {art.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={cloudinaryUrl(src, { width: 420, height: 560 }) ?? undefined} alt="" loading="lazy" />
            ))}
          </div>
        )}
        <div className="col-hero__scrim" aria-hidden />
        <div className="col-hero__body">
          <span className="eyebrow">Collection</span>
          <h1 className="display col-hero__title">{list.name}</h1>
          {list.description && <p className="col-hero__desc">{list.description}</p>}

          <div className="col-hero__meta">
            {/* Deliberately not a link: there is no public profile route — /me is
                your own page only — so a link here would 404 on the static export. */}
            <span className="col-chip col-chip--owner">
              <span className="col-chip__avatar">
                {list.ownerAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cloudinaryUrl(list.ownerAvatarUrl, { width: 42, height: 42 }) ?? undefined} alt="" />
                ) : (
                  (list.ownerName ?? "?").charAt(0).toUpperCase()
                )}
              </span>
              {list.ownerName}
            </span>
            <span className="col-chip">
              {list.visibility === "public" ? <Users size={11} /> : <Lock size={11} />}
              {list.visibility === "public" ? "Public" : "Private"}
            </span>
            <span className="col-chip">
              <Layers size={11} />
              {plural(list.itemCount, "course")}
            </span>
            <span className="col-chip">
              <Bookmark size={11} />
              {plural(list.savesCount, "save")}
            </span>
            <span className="col-chip">Edited {formatDate(list.updatedAt)}</span>
          </div>

          <div className="col-hero__actions">
            {list.isOwner ? (
              <>
                <button className="btn primary" onClick={() => setPicking(true)}>
                  <Plus size={14} /> Add courses
                </button>
                <button className="btn" onClick={() => setEditing(true)}>
                  <Pencil size={13} /> Edit
                </button>
                <button className="btn danger" onClick={() => setDoomed(true)}>
                  <Trash2 size={13} /> Delete
                </button>
              </>
            ) : (
              <button className={`btn ${list.saved ? "" : "primary"}`} onClick={save}>
                {list.saved ? (
                  <>
                    <Check size={14} /> Saved
                  </>
                ) : (
                  <>
                    <Bookmark size={14} /> Save collection
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="rail">
        <div className="section-head">
          <h2>In this collection</h2>
          {list.items.length > 0 && (
            <span className="muted" style={{ fontSize: 11 }}>
              Newest addition first
            </span>
          )}
        </div>

        {list.items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📚</div>
            <p>
              {list.isOwner
                ? "Nothing on this shelf yet. Add the courses you want to come back to."
                : "This collection is empty — its owner has not added anything yet."}
            </p>
            {list.isOwner && (
              <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setPicking(true)}>
                <Plus size={14} /> Add your first course
              </button>
            )}
          </div>
        ) : (
          <div className="col-grid">
            {list.items.map((c) => (
              <div key={c.id} className="col-item">
                <CourseCard course={asSummary(c)} fill />
                {list.isOwner && (
                  <button
                    onClick={() => removeCourse(c.id, c.title)}
                    aria-label={`Remove ${c.title} from this collection`}
                    title="Remove from collection"
                    className="col-item__remove"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

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

      <Confirm
        open={doomed}
        onClose={() => setDoomed(false)}
        title={`Delete “${list.name}”?`}
        body={`The list and its ordering go. All ${plural(list.items.length, "course")} in it stay in the catalogue.`}
        confirmLabel="Delete list"
        onConfirm={destroy}
      />

      <Toast message={toast} />
    </main>
  );
}
