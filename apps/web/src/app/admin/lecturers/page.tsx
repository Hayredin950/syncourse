"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { del, get, post, patch } from "@/lib/api";
import type { AdminLecturerRow } from "@/lib/types";
import { useAdminToast } from "@/components/admin/AdminToast";
import ConfirmButton from "@/components/admin/ConfirmButton";
import ExpandableText from "@/components/admin/ExpandableText";
import UploadField from "@/components/admin/UploadField";
import { plural } from "@/lib/format";

export default function AdminLecturersPage() {
  return (
    <Suspense fallback={<div className="admin-skeleton" style={{ height: 180, display: "block" }} />}>
      <AdminLecturers />
    </Suspense>
  );
}

function AdminLecturers() {
  const toast = useAdminToast();
  // ?new=1 comes from the ⌘K palette's "New lecturer" command.
  const wantsNew = useSearchParams().get("new") === "1";
  const [rows, setRows] = useState<AdminLecturerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminLecturerRow | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    get<AdminLecturerRow[]>("/admin/lecturers")
      .then(setRows)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // `open(null)` rather than `setEditing(null)`: the fields have to be reset
    // too, or the panel opens holding whoever was edited last.
    if (wantsNew) open(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((l) => `${l.name} ${l.bio ?? ""} ${l.credentials ?? ""}`.toLowerCase().includes(q));
  }, [rows, query]);

  /** `undefined` = panel closed, `null` = creating, a row = editing that row. */
  const open = (l: AdminLecturerRow | null) => {
    setEditing(l);
    setName(l?.name ?? "");
    setBio(l?.bio ?? "");
    setPhotoUrl(l?.photoUrl ?? "");
  };
  const close = () => setEditing(undefined);

  const save = async () => {
    if (!name.trim()) return toast.error("A name is required");
    setSaving(true);
    try {
      if (editing) {
        const res = await patch<{ id: string; name: string }>(`/admin/lecturers/${editing.id}`, {
          name,
          bio: bio || null,
          photoUrl: photoUrl || null,
        });
        setRows((p) =>
          p.map((x) => (x.id === res.id ? { ...x, name: res.name, bio: bio || null, photoUrl: photoUrl || null } : x)),
        );
        toast.success(`${res.name} updated`);
      } else {
        const res = await post<{ id: string; name: string; slug: string }>("/admin/lecturers", {
          name,
          bio: bio || null,
          photoUrl: photoUrl || null,
        });
        setRows((p) => [
          ...p,
          {
            id: res.id,
            name: res.name,
            slug: res.slug,
            bio: bio || null,
            photoUrl: photoUrl || null,
            credentials: null,
            courseCount: 0,
            createdAt: new Date().toISOString(),
          },
        ]);
        toast.success(`${res.name} added`);
      }
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that lecturer");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l: AdminLecturerRow) => {
    setBusyId(l.id);
    try {
      await del(`/admin/lecturers/${l.id}`);
      setRows((p) => p.filter((x) => x.id !== l.id));
      toast.success(`${l.name} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that lecturer");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Lecturers</h1>
          <p className="page-desc">
            Instructor profiles shown on course pages — {rows.length.toLocaleString("en-US")} on the platform.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => open(null)}>
            <Plus size={13} /> New lecturer
          </button>
        </div>
      </div>

      {editing !== undefined && (
        <div className="admin-panel">
          <div className="admin-panel__head">
            <span className="admin-panel__title">{editing ? `Edit ${editing.name}` : "New lecturer"}</span>
            <button type="button" className="admin-btn admin-btn--quiet admin-btn--icon" onClick={close} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span className="admin-label">Name</span>
              <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            <UploadField
              label="Photo"
              kind="image"
              value={photoUrl}
              onChange={setPhotoUrl}
              placeholder="https://… or upload"
              preview={{ width: 34, height: 34 }}
              hint="Square crops best — it is shown as a round avatar."
              wide={false}
            />
            <label className="admin-field admin-field--wide">
              <span className="admin-label">Bio</span>
              <textarea className="admin-textarea" value={bio} onChange={(e) => setBio(e.target.value)} />
              <span className="admin-field__hint">Shown in full on the lecturer page, clamped to two lines in lists.</span>
            </label>
          </div>
          <div className="admin-form-actions">
            <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create lecturer"}
            </button>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="admin-toolbar">
        <span className="admin-search">
          <Search size={14} />
          <input
            className="admin-input"
            placeholder="Name or bio…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search lecturers"
          />
        </span>
        <span className="admin-toolbar__count">
          {filtered.length === rows.length ? `${rows.length} total` : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      <div className="admin-card admin-card--flush">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="admin-row">
              <span className="admin-skeleton" style={{ height: 34, flex: 1 }} />
            </div>
          ))}
        {!loading && filtered.length === 0 && (
          <p className="admin-empty">{rows.length === 0 ? "No lecturers yet." : "No lecturer matches that search."}</p>
        )}
        {filtered.map((l) => (
          <div key={l.id} className="admin-row admin-row--top">
            <span className="admin-avatar">
              {l.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.photoUrl} alt="" />
              ) : (
                l.name.charAt(0).toUpperCase()
              )}
            </span>
            <div className="admin-row__main">
              <div className="admin-inline" style={{ gap: 7 }}>
                <span className="admin-row__title">{l.name}</span>
                <span className="admin-badge admin-badge--gray">
                  {plural(l.courseCount, "course")}
                </span>
              </div>
              {l.bio ? (
                <ExpandableText text={l.bio} className="admin-row__body" />
              ) : (
                <div className="admin-row__meta">No bio yet</div>
              )}
            </div>
            <div className="admin-row__actions">
              <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => open(l)}>
                Edit
              </button>
              <ConfirmButton
                label="Delete"
                question={`Delete ${l.name}?`}
                confirmLabel="Yes, delete"
                busy={busyId === l.id}
                icon={false}
                className="admin-btn admin-btn--danger admin-btn--sm"
                onConfirm={() => remove(l)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
