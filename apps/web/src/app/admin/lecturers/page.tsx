"use client";

import { useEffect, useState } from "react";
import { del, get, post, patch } from "@/lib/api";
import type { AdminLecturerRow } from "@/lib/types";
import { useToast } from "@/lib/useToast";

export default function AdminLecturers() {
  const [rows, setRows] = useState<AdminLecturerRow[]>([]);
  const [editing, setEditing] = useState<AdminLecturerRow | null>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const { toast, setToast } = useToast();

  useEffect(() => {
    get<AdminLecturerRow[]>("/admin/lecturers")
      .then(setRows)
      .catch((e) => setToast(e.message));
  }, [setToast]);

  const startEdit = (l: AdminLecturerRow | null) => {
    setEditing(l);
    setName(l?.name ?? "");
    setBio(l?.bio ?? "");
    setPhotoUrl(l?.photoUrl ?? "");
  };

  const save = async () => {
    if (!name.trim()) return setToast("Name is required");
    try {
      if (editing) {
        const res = await patch<{ id: string; name: string }>(`/admin/lecturers/${editing.id}`, {
          name,
          bio: bio || null,
          photoUrl: photoUrl || null,
        });
        setRows((p) => p.map((x) => (x.id === res.id ? { ...x, name: res.name, bio, photoUrl: photoUrl || null } : x)));
        setToast("Lecturer updated");
      } else {
        const res = await post<{ id: string; name: string; slug: string }>("/admin/lecturers", {
          name,
          bio: bio || null,
          photoUrl: photoUrl || null,
        });
        setRows((p) => [
          ...p,
          { id: res.id, name: res.name, slug: res.slug, bio: bio || null, photoUrl: photoUrl || null, credentials: null, courseCount: 0, createdAt: new Date().toISOString() },
        ]);
        setToast("Lecturer created");
      }
      startEdit(null);
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const remove = async (l: AdminLecturerRow) => {
    if (!confirm(`Delete lecturer "${l.name}"?`)) return;
    try {
      await del(`/admin/lecturers/${l.id}`);
      setRows((p) => p.filter((x) => x.id !== l.id));
      setToast("Lecturer deleted");
    } catch (e: any) {
      setToast(e.message);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Lecturers</h1>
          <p className="page-desc">Instructor profiles — {rows.length} on the platform.</p>
        </div>
        {!editing && (
          <button className="admin-btn admin-btn--primary" onClick={() => startEdit(null)}>
            + New lecturer
          </button>
        )}
      </div>

      {editing !== null && (
        <div className="admin-card">
          <h3>{editing ? `Edit: ${editing.name}` : "New lecturer"}</h3>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
            <input className="admin-input" placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="admin-input" placeholder="Photo URL" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
            <input
              className="admin-input"
              placeholder="Bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              style={{ gridColumn: "1 / -1" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="admin-btn admin-btn--primary" onClick={save}>
              Save
            </button>
            <button className="admin-btn admin-btn--ghost" onClick={() => startEdit(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
        {rows.length === 0 && (
          <p style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            No lecturers yet.
          </p>
        )}
        {rows.map((l) => (
          <div
            key={l.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface" style={{ width: 36, height: 36 }}>
              {l.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-bold text-accent">
                  {l.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#fff" }}>{l.name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                {l.courseCount} course(s) · {l.bio ? l.bio.slice(0, 80) : "no bio"}
              </div>
            </div>
            <button className="admin-btn admin-btn--ghost" onClick={() => startEdit(l)}>
              Edit
            </button>
            <button className="admin-btn admin-btn--danger" onClick={() => remove(l)}>
              Delete
            </button>
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-fit rounded-full bg-surface-raised px-4 py-2 text-xs text-text shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
