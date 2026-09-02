"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { get, patch, post } from "@/lib/api";
import type { AdminLegalRow } from "@/lib/types";
import { useAdminToast } from "@/components/admin/AdminToast";
import ConfirmButton from "@/components/admin/ConfirmButton";

const DATE = { day: "numeric", month: "short", year: "numeric" } as const;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", DATE);

/**
 * Same bump rule as the API (legal.constants.ts) so the panel can name the
 * version it is about to publish rather than saying "the next one".
 */
function nextVersion(current: string): string {
  const parts = (current || "1.0").trim().split(".");
  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last)) {
    parts[parts.length - 1] = String(Number(last) + 1);
    return parts.join(".");
  }
  return `${current}.1`;
}

/** Blank form for a brand-new document. */
const EMPTY = {
  type: "",
  title: "",
  version: "",
  bodyMd: "",
  changeSummary: "",
  requiresAcceptance: true,
  minorEdit: false,
};

export default function AdminLegalPage() {
  const toast = useAdminToast();
  const [rows, setRows] = useState<AdminLegalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminLegalRow | null | undefined>(undefined);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    get<AdminLegalRow[]>("/admin/legal")
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load legal documents"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = () => get<AdminLegalRow[]>("/admin/legal").then(setRows);
  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function open(row: AdminLegalRow | null) {
    setEditing(row);
    setForm(
      row
        ? {
            type: row.type,
            title: row.customTitle ?? "",
            version: row.version,
            bodyMd: row.bodyMd,
            changeSummary: row.changeSummary ?? "",
            requiresAcceptance: row.requiresAcceptance,
            minorEdit: false,
          }
        : EMPTY,
    );
  }
  const close = () => setEditing(undefined);

  // Whether this save will bump the version and put the document back in front
  // of everyone. Mirrors the rule the API enforces, so the button can say what
  // is about to happen instead of surprising the operator afterwards.
  const bodyChanged = !!editing && form.bodyMd.trim() !== editing.bodyMd;
  const versionTyped = !!editing && form.version.trim() !== editing.version;
  const republishing = !!editing && !form.minorEdit && (bodyChanged || versionTyped);
  const willNotify = republishing && form.requiresAcceptance ? editing.acceptedCurrent : 0;
  const publishAs = editing
    ? versionTyped && form.version.trim()
      ? form.version.trim()
      : nextVersion(editing.version)
    : form.version || "1.0";

  const save = async () => {
    if (!editing && !form.type.trim()) return toast.error("A type is required (terms, privacy…)");
    if (!form.bodyMd.trim()) return toast.error("The document body cannot be empty");
    setSaving(true);
    try {
      if (editing) {
        const res = await patch<{ message: string }>(`/admin/legal/${editing.type}`, {
          title: form.title,
          version: form.version,
          bodyMd: form.bodyMd,
          changeSummary: form.changeSummary,
          requiresAcceptance: form.requiresAcceptance,
          minorEdit: form.minorEdit,
        });
        toast.success(res.message);
      } else {
        await post(`/admin/legal`, {
          type: form.type.trim().toLowerCase(),
          title: form.title,
          version: form.version || "1.0",
          bodyMd: form.bodyMd,
          changeSummary: form.changeSummary,
          requiresAcceptance: form.requiresAcceptance,
        });
        toast.success(`${form.type.trim().toLowerCase()} created`);
      }
      await reload();
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that document");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Legal</h1>
          <p className="page-desc">
            Terms, privacy and refund text — edited here, live on the site immediately. Publishing a
            change bumps the version, which asks everyone who accepted the old wording to accept the
            new one.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => open(null)}>
            <Plus size={13} /> New document
          </button>
        </div>
      </div>

      {editing !== undefined && (
        <div className="admin-panel">
          <div className="admin-panel__head">
            <span className="admin-panel__title">
              {editing ? `Edit ${editing.title}` : "New document"}
            </span>
            <button
              type="button"
              className="admin-btn admin-btn--quiet admin-btn--icon"
              onClick={close}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          <div className="admin-form-grid">
            {!editing && (
              <label className="admin-field">
                <span className="admin-label">Type</span>
                <input
                  className="admin-input"
                  value={form.type}
                  onChange={(e) => set("type", e.target.value)}
                  placeholder="terms"
                  autoFocus
                />
                <span className="admin-field__hint">
                  Lowercase, no spaces — it becomes the URL, /legal/terms.
                </span>
              </label>
            )}
            <label className="admin-field">
              <span className="admin-label">Heading</span>
              <input
                className="admin-input"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder={editing?.title ?? "Terms of Service"}
              />
              <span className="admin-field__hint">Leave blank for the built-in name.</span>
            </label>
            <label className="admin-field">
              <span className="admin-label">Version</span>
              <input
                className="admin-input"
                value={form.version}
                onChange={(e) => set("version", e.target.value)}
                placeholder="1.0"
                style={{ width: 110 }}
              />
              <span className="admin-field__hint">
                {editing
                  ? "Leave it alone and an edit bumps it automatically."
                  : "Where this document starts."}
              </span>
            </label>
          </div>

          <label className="admin-field admin-field--wide">
            <span className="admin-label">What changed</span>
            <input
              className="admin-input admin-input--full"
              value={form.changeSummary}
              onChange={(e) => set("changeSummary", e.target.value)}
              placeholder="Accounts may no longer be shared."
            />
            <span className="admin-field__hint">
              One line, shown in the notification and the acceptance prompt. Worth writing — the
              default text just says a new version exists.
            </span>
          </label>

          <label className="admin-field admin-field--wide">
            <span className="admin-label">Document body</span>
            <textarea
              className="admin-textarea"
              value={form.bodyMd}
              onChange={(e) => set("bodyMd", e.target.value)}
              rows={18}
              style={{ minHeight: 320, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              placeholder="# Terms of Service&#10;&#10;Plain text or Markdown."
            />
            <span className="admin-field__hint">
              {form.bodyMd.length.toLocaleString("en-US")} characters. Line breaks are preserved as
              written.
            </span>
          </label>

          <div className="admin-stack" style={{ gap: 9, marginTop: 4 }}>
            <label className="admin-inline" style={{ gap: 7, fontSize: 12.5, cursor: "pointer" }}>
              <input
                type="checkbox"
                className="admin-check"
                checked={form.requiresAcceptance}
                onChange={(e) => set("requiresAcceptance", e.target.checked)}
              />
              <span>
                Users must accept this document
                <span className="admin-dim"> — leave off for informational pages like refunds</span>
              </span>
            </label>
            {editing && (
              <label className="admin-inline" style={{ gap: 7, fontSize: 12.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  className="admin-check"
                  checked={form.minorEdit}
                  onChange={(e) => set("minorEdit", e.target.checked)}
                />
                <span>
                  Minor correction
                  <span className="admin-dim">
                    {" "}
                    — fix a typo without changing the version or prompting anyone
                  </span>
                </span>
              </label>
            )}
          </div>

          {editing && (
            <div
              className={`admin-alert ${willNotify > 0 ? "admin-alert--warn" : "admin-alert--info"}`}
              style={{ marginTop: 12 }}
            >
              {form.minorEdit
                ? `Saving quietly as v${editing.version}. Nobody is notified and no acceptance is reset.`
                : republishing
                  ? `Publishing as v${publishAs} — ${
                      willNotify === 0
                        ? "nobody has accepted this version yet, so no notifications go out."
                        : `${willNotify.toLocaleString("en-US")} ${
                            willNotify === 1 ? "person" : "people"
                          } who accepted v${editing.version} will be notified and asked to accept again.`
                    }`
                  : "No text change yet — saving now only updates the settings above."}
            </div>
          )}

          <div className="admin-form-actions">
            {editing && republishing && willNotify > 0 ? (
              <ConfirmButton
                label={`Publish and notify ${willNotify.toLocaleString("en-US")}`}
                question={`Notify ${willNotify.toLocaleString("en-US")} ${willNotify === 1 ? "user" : "users"}?`}
                confirmLabel="Yes, publish"
                busy={saving}
                icon={false}
                className="admin-btn admin-btn--primary"
                onConfirm={save}
              />
            ) : (
              <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create document"}
              </button>
            )}
            <button type="button" className="admin-btn admin-btn--ghost" onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="admin-card admin-card--flush">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="admin-row">
              <span className="admin-skeleton" style={{ height: 34, flex: 1 }} />
            </div>
          ))}
        {!loading && rows.length === 0 && (
          <p className="admin-empty">
            No legal documents yet. Create one and it appears at /legal/&lt;type&gt; straight away.
          </p>
        )}
        {rows.map((d) => (
          <div key={d.id} className="admin-row">
            <div className="admin-row__main">
              <div className="admin-row__title">
                {d.title}
                <span className="admin-badge admin-badge--accent" style={{ marginLeft: 8 }}>
                  v{d.version}
                </span>
                {!d.requiresAcceptance && (
                  <span className="admin-badge admin-badge--gray" style={{ marginLeft: 6 }}>
                    informational
                  </span>
                )}
              </div>
              <div className="admin-row__meta">
                /legal/{d.type} · effective {fmt(d.effectiveAt)} · edited {fmt(d.updatedAt)}
                {d.updatedBy ? ` by ${d.updatedBy}` : ""}
                {d.requiresAcceptance &&
                  ` · ${d.acceptedCurrent.toLocaleString("en-US")} of ${d.eligibleUsers.toLocaleString(
                    "en-US",
                  )} accounts on this version`}
              </div>
            </div>
            <div className="admin-row__actions">
              <a
                className="admin-btn admin-btn--ghost admin-btn--sm"
                href={`/legal/${d.type}`}
                target="_blank"
                rel="noreferrer"
              >
                View
              </a>
              <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => open(d)}>
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
