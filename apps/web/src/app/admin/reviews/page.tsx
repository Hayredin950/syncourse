"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, MessageSquare, Search } from "lucide-react";
import { del, get } from "@/lib/api";
import type { AdminReviewRow } from "@/lib/types";
import { relativeTime } from "@/lib/metrics";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminAvatar from "@/components/admin/AdminAvatar";
import AdminEmpty from "@/components/admin/AdminEmpty";
import ConfirmButton from "@/components/admin/ConfirmButton";
import ExpandableText from "@/components/admin/ExpandableText";
import Pagination, { clampPage } from "@/components/admin/Pagination";
import { plural } from "@/lib/format";

export default function AdminReviews() {
  const toast = useAdminToast();
  const [reviews, setReviews] = useState<AdminReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  useEffect(() => {
    get<AdminReviewRow[]>("/admin/reviews")
      .then(setReviews)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reviews.filter((r) => {
      if (q && !`${r.author.name} ${r.author.email} ${r.course.title} ${r.body}`.toLowerCase().includes(q)) return false;
      if (scope === "spoilers" && !r.containsSpoilers) return false;
      if (scope === "discussed" && r.replyCount === 0) return false;
      return true;
    });
  }, [reviews, query, scope]);

  const safePage = clampPage(page, filtered.length, perPage);
  const visible = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const remove = async (r: AdminReviewRow) => {
    setBusyId(r.id);
    try {
      await del(`/admin/reviews/${r.id}`);
      setReviews((p) => p.filter((x) => x.id !== r.id));
      toast.success(`Review by ${r.author.name} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that review");
    } finally {
      setBusyId(null);
    }
  };

  const spoilers = reviews.filter((r) => r.containsSpoilers).length;

  const clearFilters = () => {
    setQuery("");
    setScope("all");
    setPage(1);
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Reviews &amp; discussion</h1>
          <p className="page-desc">
            Remove spam, spoilers or abusive content. Deleting a review takes its replies with it.
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <span className="admin-search">
          <Search size={14} />
          <input
            className="admin-input"
            placeholder="Author, course or review text…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            aria-label="Search reviews"
          />
        </span>
        <div className="admin-seg" role="group" aria-label="Filter reviews">
          {[
            ["all", "All"],
            ["spoilers", `Spoilers${spoilers ? ` (${spoilers})` : ""}`],
            ["discussed", "Has replies"],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              aria-pressed={scope === val}
              onClick={() => {
                setScope(val);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="admin-toolbar__count">
          {filtered.length === reviews.length ? `${reviews.length} loaded` : `${filtered.length} of ${reviews.length}`}
        </span>
      </div>

      <div className="admin-card admin-card--flush">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="admin-row">
              <span className="admin-skeleton" style={{ height: 44, flex: 1 }} />
            </div>
          ))}
        {!loading && visible.length === 0 && (
          <AdminEmpty
            icon={<MessageSquare size={18} />}
            title={reviews.length === 0 ? "No reviews yet" : "Nothing matches those filters"}
            hint={
              reviews.length === 0
                ? "Reviews arrive from course pages. Nothing to moderate is the good outcome."
                : "Search matches the author, the course and the review body."
            }
            action={reviews.length === 0 ? undefined : { label: "Clear filters", onClick: clearFilters }}
          />
        )}
        {visible.map((r) => (
          <div key={r.id} className="admin-row admin-row--top">
            <AdminAvatar src={r.author.avatarUrl} name={r.author.name} />
            <div className="admin-row__main">
              <div className="admin-inline" style={{ gap: 7, flexWrap: "wrap" }}>
                <Link href={`/admin/users/detail?id=${r.author.id}`} className="admin-row__title">
                  {r.author.name}
                </Link>
                <span className="admin-dim">on</span>
                <Link href={`/admin/courses/detail?slug=${r.course.slug}`} className="admin-cell-link" style={{ fontSize: 12 }}>
                  {r.course.title}
                </Link>
                {r.containsSpoilers && (
                  <span className="admin-status admin-status--warn">
                    <AlertTriangle size={11} /> Spoilers
                  </span>
                )}
              </div>
              <ExpandableText text={r.body} lines={3} className="admin-row__body" />
              <div className="admin-row__meta">
                {relativeTime(r.createdAt)} · {plural(r.upvoteCount, "upvote")} ·{" "}
                {plural(r.replyCount, "reply", "replies")} · {r.author.email}
              </div>
            </div>
            <div className="admin-row__actions">
              <ConfirmButton
                label="Delete"
                question="Delete this review and its replies?"
                confirmLabel="Yes, delete"
                busy={busyId === r.id}
                icon={false}
                className="admin-btn admin-btn--danger admin-btn--sm"
                onConfirm={() => remove(r)}
              />
            </div>
          </div>
        ))}
        <Pagination
          page={safePage}
          perPage={perPage}
          total={filtered.length}
          onPage={setPage}
          onPerPage={setPerPage}
          noun="reviews"
        />
      </div>

      <p className="admin-section-head__hint" style={{ marginTop: 10 }}>
        This list holds the 100 most recent reviews on the platform — older ones are not loaded.
      </p>
    </div>
  );
}
