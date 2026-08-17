"use client";

import { useEffect, useState } from "react";
import { del, get } from "@/lib/api";
import type { AdminReviewRow } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useToast } from "@/lib/useToast";

export default function AdminReviews() {
  const [reviews, setReviews] = useState<AdminReviewRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast, setToast } = useToast();

  useEffect(() => {
    get<AdminReviewRow[]>("/admin/reviews")
      .then(setReviews)
      .catch((e) => setToast(e.message));
  }, [setToast]);

  const remove = async (id: string) => {
    if (!confirm("Delete this review and its replies?")) return;
    setBusyId(id);
    try {
      await del(`/admin/reviews/${id}`);
      setReviews((p) => p.filter((r) => r.id !== id));
      setToast("Review deleted");
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Reviews &amp; Discussion</h1>
          <p className="page-desc">
            {reviews.length} recent review(s) — remove spam, spoilers or abusive content.
          </p>
        </div>
      </div>

      <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
        {reviews.length === 0 && (
          <p style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            No reviews yet.
          </p>
        )}
        {reviews.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              gap: 12,
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface"
              style={{ width: 32, height: 32 }}
            >
              {r.author.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.author.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-bold text-accent">
                  {r.author.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "#fff" }}>{r.author.name}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>on</span>
                <span style={{ fontSize: 12, color: "#f59e0b" }}>{r.course.title}</span>
                {r.containsSpoilers && <span className="admin-badge admin-badge--gray">SPOILERS</span>}
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", margin: "4px 0", lineHeight: 1.5 }}>
                {r.body}
              </p>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                {formatDate(r.createdAt)} · ↑ {r.upvoteCount} · {r.replyCount} repl{r.replyCount === 1 ? "y" : "ies"}
              </div>
            </div>
            <button
              onClick={() => remove(r.id)}
              disabled={busyId === r.id}
              className="admin-btn admin-btn--danger"
              style={{ alignSelf: "flex-start", flexShrink: 0 }}
            >
              {busyId === r.id ? "…" : "Delete"}
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
