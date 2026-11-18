"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Inbox, RefreshCw, Trash2 } from "lucide-react";
import { get, post } from "@/lib/api";
import { relativeTime } from "@/lib/metrics";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminEmpty from "@/components/admin/AdminEmpty";
import ConfirmButton from "@/components/admin/ConfirmButton";

/**
 * Course drafts proposed by the Telegram group watcher.
 *
 * The watcher reads the announcement template the group already uses and
 * attaches the ZIPs posted after it. It never publishes on its own: this page
 * and the bot's inline buttons are the two ways a draft becomes a course.
 *
 * Local types on purpose. The API shape is page-specific and this console
 * should not force the public client types to carry an admin-only payload.
 */

interface DraftFile {
  fileName: string;
  fileSizeMb: number | null;
  moduleTitle: string | null;
  partIndex: number;
}

interface DraftRow {
  id: string;
  shortId: string;
  status: "pending" | "approved" | "discarded" | "failed";
  createdAt: string;
  error: string | null;
  approvedCourseId: string | null;
  payload: {
    announcement: {
      title: string;
      lecturerNames: string[];
      durationMin: number | null;
      lessonCount: number | null;
      originalPrice: number | null;
      hashtags: string[];
    };
    files: DraftFile[];
    categorySlugs: string[];
    confidence: number;
    signals: string[];
    approvedCourseSlug?: string;
  };
}

interface DraftsResponse {
  counts: { pending: number; approved: number; discarded: number; failed: number };
  drafts: DraftRow[];
}

type Status = DraftRow["status"];

const TABS: { key: Status; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "discarded", label: "Discarded" },
  { key: "failed", label: "Failed" },
];

function sizeLabel(mb: number | null): string {
  if (mb === null) return "—";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export default function AdminDraftsPage() {
  const toast = useAdminToast();
  const [status, setStatus] = useState<Status>("pending");
  const [data, setData] = useState<DraftsResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    setError("");
    get<DraftsResponse>(`/telegram-ingest/drafts?status=${status}&limit=50`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load drafts"));
  }, [status]);

  useEffect(load, [load]);

  const act = async (draft: DraftRow, action: "approve" | "discard") => {
    setBusy(draft.id);
    try {
      if (action === "approve") {
        const r = await post<{ course?: { slug: string; title: string }; filesAdded: number }>(
          `/telegram-ingest/drafts/${draft.id}/approve`,
        );
        toast.success(`Published ${r.course?.title ?? "course"} with ${r.filesAdded} files`);
      } else {
        await post(`/telegram-ingest/drafts/${draft.id}/discard`);
        toast.success("Draft discarded — it will not be proposed again");
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work");
    } finally {
      setBusy("");
    }
  };

  if (error) {
    return (
      <div>
        <div className="admin-page-head">
          <h1>Course drafts</h1>
        </div>
        <div className="admin-card">
          <AdminEmpty
            icon={<AlertTriangle size={18} />}
            title="Could not load drafts"
            hint={error}
            action={{ label: "Try again", onClick: load }}
          />
        </div>
      </div>
    );
  }

  const counts = data?.counts;
  const rows = data?.drafts ?? [];

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Course drafts</h1>
          <p className="page-desc">
            Courses the group watcher found. Posting an announcement in the source group opens a draft; the ZIPs
            posted after it are attached automatically. Nothing goes live until you approve it here or in the bot.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <button type="button" className="admin-btn admin-btn--ghost" onClick={load}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {counts && (
        <div className="admin-minitiles" style={{ marginBottom: 14 }}>
          <div className="admin-minitile">
            <strong>{counts.pending}</strong>
            <span>Pending review</span>
          </div>
          <div className="admin-minitile">
            <strong>{counts.approved}</strong>
            <span>Approved</span>
          </div>
          <div className="admin-minitile">
            <strong>{counts.discarded}</strong>
            <span>Discarded</span>
          </div>
          <div className="admin-minitile">
            <strong>{counts.failed}</strong>
            <span>Failed</span>
          </div>
        </div>
      )}

      <div className="admin-seg" role="tablist" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-pressed={status === t.key}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
            {counts && counts[t.key] > 0 ? ` · ${counts[t.key]}` : ""}
          </button>
        ))}
      </div>

      {!data ? (
        <span className="admin-skeleton" style={{ height: 160, display: "block" }} />
      ) : rows.length === 0 ? (
        <div className="admin-card">
          <AdminEmpty
            icon={<Inbox size={18} />}
            title={status === "pending" ? "Nothing waiting" : `No ${status} drafts`}
            hint={
              status === "pending"
                ? "Post a course announcement in the Telegram group and it will appear here within seconds."
                : undefined
            }
          />
        </div>
      ) : (
        <div className="admin-stack">
          {rows.map((draft) => {
            const a = draft.payload?.announcement;
            const files = draft.payload?.files ?? [];
            const totalMb = files.reduce((n, f) => n + (f.fileSizeMb ?? 0), 0);
            const modules = new Set(files.map((f) => f.moduleTitle ?? "")).size;
            return (
              <div key={draft.id} className="admin-card">
                <div className="admin-row" style={{ alignItems: "flex-start" }}>
                  <div className="admin-row__main">
                    <div className="admin-row__title">
                      {a?.title ?? "Untitled"}{" "}
                      <span className="admin-table__quiet">
                        · {Math.round((draft.payload?.confidence ?? 0) * 100)}%
                      </span>
                    </div>
                    <div className="admin-row__meta">
                      {a?.lecturerNames?.length ? `👤 ${a.lecturerNames.join(", ")} · ` : ""}
                      {files.length} file{files.length === 1 ? "" : "s"} · {sizeLabel(totalMb)} · {modules} module
                      {modules === 1 ? "" : "s"} · <code>{draft.shortId}</code> · {relativeTime(draft.createdAt)}
                    </div>
                    {a?.hashtags?.length ? (
                      <div className="admin-row__meta" style={{ marginTop: 4 }}>
                        {a.hashtags.slice(0, 8).map((t) => `#${t}`).join(" ")}
                      </div>
                    ) : null}
                    {draft.payload?.categorySlugs?.length ? (
                      <div className="admin-row__meta" style={{ marginTop: 2 }}>
                        Categories: {draft.payload.categorySlugs.join(", ")}
                      </div>
                    ) : null}
                    {draft.payload?.signals?.includes("course-exists") ? (
                      <div className="admin-notice admin-notice--warn" style={{ marginTop: 8 }}>
                        <AlertTriangle size={13} />
                        <span>A course with this title already exists — approving adds the new files to it.</span>
                      </div>
                    ) : null}
                    {draft.error ? (
                      <div className="admin-row__meta" style={{ color: "var(--adm-bad)", marginTop: 6 }}>
                        {draft.error}
                      </div>
                    ) : null}
                  </div>
                  <div className="admin-row__actions">
                    {draft.status === "pending" ? (
                      <>
                        <ConfirmButton
                          label="Create course"
                          question={`Publish “${a?.title ?? "this course"}” with ${files.length} files?`}
                          confirmLabel="Publish"
                          className="admin-btn admin-btn--primary admin-btn--sm"
                          busy={busy === draft.id}
                          onConfirm={() => act(draft, "approve")}
                        />
                        <ConfirmButton
                          label="Discard"
                          question="Discard this draft? The post will not be proposed again."
                          confirmLabel="Discard"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          busy={busy === draft.id}
                          onConfirm={() => act(draft, "discard")}
                        />
                      </>
                    ) : draft.approvedCourseId ? (
                      <Link
                        className="admin-btn admin-btn--ghost admin-btn--sm"
                        href={
                          draft.payload?.approvedCourseSlug
                            ? `/admin/courses/detail?slug=${encodeURIComponent(draft.payload.approvedCourseSlug)}`
                            : "/admin/courses"
                        }
                      >
                        <Check size={12} /> Open course
                      </Link>
                    ) : draft.status === "discarded" ? (
                      <span className="admin-table__quiet">
                        <Trash2 size={12} style={{ display: "inline", verticalAlign: -1 }} /> discarded
                      </span>
                    ) : null}
                  </div>
                </div>

                {files.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary className="admin-table__quiet" style={{ cursor: "pointer" }}>
                      Show {files.length} attached file{files.length === 1 ? "" : "s"}
                    </summary>
                    <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                      {files.slice(0, 60).map((f) => (
                        <div key={`${f.fileName}-${f.partIndex}`} className="admin-row__meta">
                          {f.fileName} <span className="admin-table__quiet">· {sizeLabel(f.fileSizeMb)}</span>
                        </div>
                      ))}
                      {files.length > 60 && (
                        <div className="admin-row__meta">…and {files.length - 60} more</div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
