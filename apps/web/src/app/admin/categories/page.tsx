"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { del, get, post, patch } from "@/lib/api";
import type { AdminCategoryRow } from "@/lib/types";
import { useAdminToast } from "@/components/admin/AdminToast";
import ConfirmButton from "@/components/admin/ConfirmButton";

export default function AdminCategoriesPage() {
  return (
    <Suspense fallback={<div className="admin-skeleton" style={{ height: 180, display: "block" }} />}>
      <AdminCategories />
    </Suspense>
  );
}

function AdminCategories() {
  const toast = useAdminToast();
  const wantsNew = useSearchParams().get("new") === "1";
  const [rows, setRows] = useState<AdminCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminCategoryRow | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📚");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    get<AdminCategoryRow[]>("/admin/categories")
      .then(setRows)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (wantsNew) open(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => c.name.toLowerCase().includes(q));
  }, [rows, query]);

  // Empty categories are the ones worth spotting: they show up in browse with
  // nothing behind them.
  const empty = rows.filter((c) => c.courseCount === 0).length;

  function open(c: AdminCategoryRow | null) {
    setEditing(c);
    setName(c?.name ?? "");
    setIcon(c?.icon ?? "📚");
  }
  const close = () => setEditing(undefined);

  const save = async () => {
    if (!name.trim()) return toast.error("A name is required");
    setSaving(true);
    try {
      if (editing) {
        const res = await patch<{ id: string; name: string }>(`/admin/categories/${editing.id}`, { name, icon });
        setRows((p) => p.map((x) => (x.id === res.id ? { ...x, name: res.name, icon } : x)));
        toast.success(`${res.name} updated`);
      } else {
        const res = await post<{ id: string; name: string; slug: string }>("/admin/categories", { name, icon });
        setRows((p) => [
          ...p,
          {
            id: res.id,
            name: res.name,
            slug: res.slug,
            icon,
            coverImage: null,
            sortOrder: p.length,
            courseCount: 0,
            createdAt: new Date().toISOString(),
          },
        ]);
        toast.success(`${res.name} added`);
      }
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that category");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: AdminCategoryRow) => {
    setBusyId(c.id);
    try {
      await del(`/admin/categories/${c.id}`);
      setRows((p) => p.filter((x) => x.id !== c.id));
      toast.success(`${c.name} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that category");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Categories</h1>
          <p className="page-desc">
            Browse groupings shown on the home page — {rows.length.toLocaleString("en-US")} in use
            {empty > 0 && `, ${empty} with no courses`}.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => open(null)}>
            <Plus size={13} /> New category
          </button>
        </div>
      </div>

      {editing !== undefined && (
        <div className="admin-panel">
          <div className="admin-panel__head">
            <span className="admin-panel__title">{editing ? `Edit ${editing.name}` : "New category"}</span>
            <button type="button" className="admin-btn admin-btn--quiet admin-btn--icon" onClick={close} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span className="admin-label">Name</span>
              <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            <label className="admin-field">
              <span className="admin-label">Icon</span>
              <input
                className="admin-input"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                style={{ minWidth: 0, width: 88, fontSize: 16 }}
              />
              <span className="admin-field__hint">A single emoji reads best at browse size.</span>
            </label>
          </div>
          <div className="admin-form-actions">
            <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create category"}
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
            placeholder="Category name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search categories"
          />
        </span>
        <span className="admin-toolbar__count">
          {filtered.length === rows.length ? `${rows.length} total` : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      <div className="admin-card admin-card--flush">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-row">
              <span className="admin-skeleton" style={{ height: 26, flex: 1 }} />
            </div>
          ))}
        {!loading && filtered.length === 0 && (
          <p className="admin-empty">{rows.length === 0 ? "No categories yet." : "No category matches that search."}</p>
        )}
        {filtered.map((c) => (
          <div key={c.id} className="admin-row">
            <span style={{ fontSize: 19, lineHeight: 1, width: 24, textAlign: "center" }} aria-hidden="true">
              {c.icon}
            </span>
            <div className="admin-row__main">
              <div className="admin-row__title">{c.name}</div>
              <div className="admin-row__meta">
                {c.courseCount === 0 ? "No courses yet" : `${c.courseCount} course${c.courseCount === 1 ? "" : "s"}`} ·{" "}
                {c.slug}
              </div>
            </div>
            <div className="admin-row__actions">
              <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => open(c)}>
                Edit
              </button>
              <ConfirmButton
                label="Delete"
                question={`Delete ${c.name}?`}
                confirmLabel="Yes, delete"
                busy={busyId === c.id}
                icon={false}
                className="admin-btn admin-btn--danger admin-btn--sm"
                onConfirm={() => remove(c)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
