"use client";

import { useEffect, useState } from "react";
import { del, get, post, patch } from "@/lib/api";
import type { AdminCategoryRow } from "@/lib/types";
import { useToast } from "@/lib/useToast";

export default function AdminCategories() {
  const [rows, setRows] = useState<AdminCategoryRow[]>([]);
  const [editing, setEditing] = useState<AdminCategoryRow | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📚");
  const { toast, setToast } = useToast();

  useEffect(() => {
    get<AdminCategoryRow[]>("/admin/categories")
      .then(setRows)
      .catch((e) => setToast(e.message));
  }, [setToast]);

  const startEdit = (c: AdminCategoryRow | null) => {
    setEditing(c);
    setName(c?.name ?? "");
    setIcon(c?.icon ?? "📚");
  };

  const save = async () => {
    if (!name.trim()) return setToast("Name is required");
    try {
      if (editing) {
        const res = await patch<{ id: string; name: string }>(`/admin/categories/${editing.id}`, { name, icon });
        setRows((p) => p.map((x) => (x.id === res.id ? { ...x, name: res.name, icon } : x)));
        setToast("Category updated");
      } else {
        const res = await post<{ id: string; name: string; slug: string }>("/admin/categories", { name, icon });
        setRows((p) => [
          ...p,
          { id: res.id, name: res.name, slug: res.slug, icon, coverImage: null, sortOrder: p.length, courseCount: 0, createdAt: new Date().toISOString() },
        ]);
        setToast("Category created");
      }
      startEdit(null);
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const remove = async (c: AdminCategoryRow) => {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    try {
      await del(`/admin/categories/${c.id}`);
      setRows((p) => p.filter((x) => x.id !== c.id));
      setToast("Category deleted");
    } catch (e: any) {
      setToast(e.message);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Categories</h1>
          <p className="page-desc">Browse groupings shown on the home page — {rows.length} categories.</p>
        </div>
        {!editing && (
          <button className="admin-btn admin-btn--primary" onClick={() => startEdit(null)}>
            + New category
          </button>
        )}
      </div>

      {editing !== null && (
        <div className="admin-card">
          <h3>{editing ? `Edit: ${editing.name}` : "New category"}</h3>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <input className="admin-input" placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
            <input
              className="admin-input"
              placeholder="Icon (emoji)"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              style={{ minWidth: 80, width: 80 }}
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
            No categories yet.
          </p>
        )}
        {rows.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span style={{ fontSize: 20 }}>{c.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#fff" }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{c.courseCount} course(s)</div>
            </div>
            <button className="admin-btn admin-btn--ghost" onClick={() => startEdit(c)}>
              Edit
            </button>
            <button className="admin-btn admin-btn--danger" onClick={() => remove(c)}>
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
