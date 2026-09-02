"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { del, get, post, patch } from "@/lib/api";
import type { AdminPublisherRow } from "@/lib/types";
import { useAdminToast } from "@/components/admin/AdminToast";
import ConfirmButton from "@/components/admin/ConfirmButton";
import ExpandableText from "@/components/admin/ExpandableText";
import UploadField from "@/components/admin/UploadField";

const ORG_TYPES = [
  ["publisher", "Publisher"],
  ["university", "University"],
  ["company", "Company"],
] as const;

export default function AdminPublishersPage() {
  return (
    <Suspense fallback={<div className="admin-skeleton" style={{ height: 180, display: "block" }} />}>
      <AdminPublishers />
    </Suspense>
  );
}

function AdminPublishers() {
  const toast = useAdminToast();
  const wantsNew = useSearchParams().get("new") === "1";
  const [rows, setRows] = useState<AdminPublisherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [editing, setEditing] = useState<AdminPublisherRow | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState("publisher");
  const [logoUrl, setLogoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    get<AdminPublisherRow[]>("/admin/publishers")
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
    return rows.filter((p) => {
      if (q && !`${p.name} ${p.description ?? ""}`.toLowerCase().includes(q)) return false;
      if (typeFilter !== "all" && p.orgType !== typeFilter) return false;
      return true;
    });
  }, [rows, query, typeFilter]);

  function open(p: AdminPublisherRow | null) {
    setEditing(p);
    setName(p?.name ?? "");
    setOrgType(p?.orgType ?? "publisher");
    setLogoUrl(p?.logoUrl ?? "");
    setDescription(p?.description ?? "");
  }
  const close = () => setEditing(undefined);

  const save = async () => {
    if (!name.trim()) return toast.error("A name is required");
    setSaving(true);
    const body = { name, orgType, logoUrl: logoUrl || null, description: description || null };
    try {
      if (editing) {
        const res = await patch<{ id: string; name: string }>(`/admin/publishers/${editing.id}`, body);
        setRows((p) =>
          p.map((x) =>
            x.id === res.id
              ? { ...x, name: res.name, orgType, logoUrl: logoUrl || null, description: description || null }
              : x,
          ),
        );
        toast.success(`${res.name} updated`);
      } else {
        const res = await post<{ id: string; name: string; slug: string }>("/admin/publishers", body);
        setRows((p) => [
          ...p,
          {
            id: res.id,
            name: res.name,
            slug: res.slug,
            orgType,
            logoUrl: logoUrl || null,
            description: description || null,
            subscribers: 0,
            courseCount: 0,
            createdAt: new Date().toISOString(),
          },
        ]);
        toast.success(`${res.name} added`);
      }
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that publisher");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: AdminPublisherRow) => {
    setBusyId(p.id);
    try {
      await del(`/admin/publishers/${p.id}`);
      setRows((rows) => rows.filter((x) => x.id !== p.id));
      toast.success(`${p.name} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that publisher");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Publishers</h1>
          <p className="page-desc">
            Schools, companies and channels that own courses — {rows.length.toLocaleString("en-US")} on the platform.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => open(null)}>
            <Plus size={13} /> New publisher
          </button>
        </div>
      </div>

      {editing !== undefined && (
        <div className="admin-panel">
          <div className="admin-panel__head">
            <span className="admin-panel__title">{editing ? `Edit ${editing.name}` : "New publisher"}</span>
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
              <span className="admin-label">Type</span>
              <select className="admin-select" value={orgType} onChange={(e) => setOrgType(e.target.value)}>
                {ORG_TYPES.map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <UploadField
              label="Logo"
              kind="image"
              value={logoUrl}
              onChange={setLogoUrl}
              placeholder="https://… or upload"
              preview={{ width: 40, height: 40 }}
              hint="Shown at small sizes — a square mark reads better than a wordmark."
            />
            <label className="admin-field admin-field--wide">
              <span className="admin-label">Description</span>
              <textarea
                className="admin-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>
          <div className="admin-form-actions">
            <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create publisher"}
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
            placeholder="Name or description…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search publishers"
          />
        </span>
        <div className="admin-seg" role="group" aria-label="Filter by type">
          <button type="button" aria-pressed={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
            All
          </button>
          {ORG_TYPES.map(([val, label]) => (
            <button key={val} type="button" aria-pressed={typeFilter === val} onClick={() => setTypeFilter(val)}>
              {label}
            </button>
          ))}
        </div>
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
          <p className="admin-empty">{rows.length === 0 ? "No publishers yet." : "Nothing matches those filters."}</p>
        )}
        {filtered.map((p) => (
          <div key={p.id} className="admin-row admin-row--top">
            <span className="admin-avatar admin-avatar--sq">
              {p.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.logoUrl} alt="" style={{ objectFit: "contain" }} />
              ) : (
                p.name.charAt(0).toUpperCase()
              )}
            </span>
            <div className="admin-row__main">
              <div className="admin-inline" style={{ gap: 7 }}>
                <span className="admin-row__title">{p.name}</span>
                <span className="admin-badge admin-badge--gray">{p.orgType}</span>
                <span className="admin-badge admin-badge--gray">
                  {p.courseCount} course{p.courseCount === 1 ? "" : "s"}
                </span>
              </div>
              {p.description ? (
                <ExpandableText text={p.description} className="admin-row__body" />
              ) : (
                <div className="admin-row__meta">No description yet</div>
              )}
            </div>
            <div className="admin-row__actions">
              <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => open(p)}>
                Edit
              </button>
              <ConfirmButton
                label="Delete"
                question={`Delete ${p.name}?`}
                confirmLabel="Yes, delete"
                busy={busyId === p.id}
                icon={false}
                className="admin-btn admin-btn--danger admin-btn--sm"
                onConfirm={() => remove(p)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
