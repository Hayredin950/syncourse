"use client";

import { useEffect, useState } from "react";
import { del, get, post, patch } from "@/lib/api";
import type { AdminPublisherRow } from "@/lib/types";
import { useToast } from "@/lib/useToast";

export default function AdminPublishers() {
  const [rows, setRows] = useState<AdminPublisherRow[]>([]);
  const [editing, setEditing] = useState<AdminPublisherRow | null>(null);
  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState("publisher");
  const [logoUrl, setLogoUrl] = useState("");
  const [description, setDescription] = useState("");
  const { toast, setToast } = useToast();

  useEffect(() => {
    get<AdminPublisherRow[]>("/admin/publishers")
      .then(setRows)
      .catch((e) => setToast(e.message));
  }, [setToast]);

  const startEdit = (p: AdminPublisherRow | null) => {
    setEditing(p);
    setName(p?.name ?? "");
    setOrgType(p?.orgType ?? "publisher");
    setLogoUrl(p?.logoUrl ?? "");
    setDescription(p?.description ?? "");
  };

  const save = async () => {
    if (!name.trim()) return setToast("Name is required");
    try {
      const body = { name, orgType, logoUrl: logoUrl || null, description: description || null };
      if (editing) {
        const res = await patch<{ id: string; name: string }>(`/admin/publishers/${editing.id}`, body);
        setRows((p) =>
          p.map((x) => (x.id === res.id ? { ...x, name: res.name, orgType, logoUrl: logoUrl || null, description: description || null } : x)),
        );
        setToast("Publisher updated");
      } else {
        const res = await post<{ id: string; name: string; slug: string }>("/admin/publishers", body);
        setRows((p) => [
          ...p,
          { id: res.id, name: res.name, slug: res.slug, orgType, logoUrl: logoUrl || null, description: description || null, subscribers: 0, courseCount: 0, createdAt: new Date().toISOString() },
        ]);
        setToast("Publisher created");
      }
      startEdit(null);
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const remove = async (p: AdminPublisherRow) => {
    if (!confirm(`Delete publisher "${p.name}"?`)) return;
    try {
      await del(`/admin/publishers/${p.id}`);
      setRows((rows) => rows.filter((x) => x.id !== p.id));
      setToast("Publisher deleted");
    } catch (e: any) {
      setToast(e.message);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Publishers</h1>
          <p className="page-desc">Schools, companies and channels — {rows.length} on the platform.</p>
        </div>
        {!editing && (
          <button className="admin-btn admin-btn--primary" onClick={() => startEdit(null)}>
            + New publisher
          </button>
        )}
      </div>

      {editing !== null && (
        <div className="admin-card">
          <h3>{editing ? `Edit: ${editing.name}` : "New publisher"}</h3>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
            <input className="admin-input" placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} />
            <select className="admin-select" value={orgType} onChange={(e) => setOrgType(e.target.value)}>
              <option value="publisher">Publisher</option>
              <option value="university">University</option>
              <option value="company">Company</option>
            </select>
            <input className="admin-input" placeholder="Logo URL" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
            <input
              className="admin-input"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
            No publishers yet.
          </p>
        )}
        {rows.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-surface" style={{ width: 36, height: 36 }}>
              {p.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.logoUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-bold text-accent">
                  {p.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#fff" }}>
                {p.name} <span className="admin-badge admin-badge--gray">{p.orgType.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                {p.courseCount} course(s)
                {p.description ? ` · ${p.description.slice(0, 70)}` : ""}
              </div>
            </div>
            <button className="admin-btn admin-btn--ghost" onClick={() => startEdit(p)}>
              Edit
            </button>
            <button className="admin-btn admin-btn--danger" onClick={() => remove(p)}>
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
