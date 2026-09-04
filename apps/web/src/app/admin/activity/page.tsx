"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { History, Search } from "lucide-react";
import { get } from "@/lib/api";
import type { AdminCourseRow, AdminPaymentRow, AdminReviewRow, AdminUserRow } from "@/lib/types";
import { formatDate, plural } from "@/lib/format";
import { relativeTime } from "@/lib/metrics";
import AdminEmpty from "@/components/admin/AdminEmpty";

/**
 * Activity log.
 *
 * The API's /admin/activity returns a fixed 12-event digest, which is right for
 * the dashboard card and useless as a log. So this page composes its own
 * timeline from the four list endpoints, all of which carry createdAt — one
 * request each, merged and sorted client-side. Users and courses are complete;
 * reviews and payments are the 100 most recent, which the footer says out loud.
 *
 * This is a derived feed, not an audit trail: it shows things users did, not
 * things staff did. A real audit log needs a table on the API side.
 */
type Kind = "user" | "course" | "review" | "payment";

interface Event {
  id: string;
  kind: Kind;
  at: string;
  title: string;
  detail?: string;
  href?: string;
}

const KINDS: [Kind | "all", string][] = [
  ["all", "Everything"],
  ["user", "Signups"],
  ["course", "Courses"],
  ["review", "Reviews"],
  ["payment", "Payments"],
];

const SHOW_STEP = 60;

export default function AdminActivity() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [courses, setCourses] = useState<AdminCourseRow[] | null>(null);
  const [reviews, setReviews] = useState<AdminReviewRow[] | null>(null);
  const [payments, setPayments] = useState<AdminPaymentRow[] | null>(null);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(SHOW_STEP);

  // Each stream fails independently — losing payments should not blank the log.
  useEffect(() => {
    get<AdminUserRow[]>("/admin/users").then(setUsers).catch(() => setUsers([]));
    get<AdminCourseRow[]>("/admin/courses").then(setCourses).catch(() => setCourses([]));
    get<AdminReviewRow[]>("/admin/reviews").then(setReviews).catch(() => setReviews([]));
    get<AdminPaymentRow[]>("/admin/payments").then(setPayments).catch(() => setPayments([]));
  }, []);

  const loading = users === null || courses === null || reviews === null || payments === null;

  const events = useMemo<Event[]>(() => {
    const out: Event[] = [];

    for (const u of users ?? []) {
      out.push({
        id: `u:${u.id}`,
        kind: "user",
        at: u.createdAt,
        title: `${u.name} joined`,
        detail: u.isStaff ? `${u.email} · staff` : u.email,
        href: `/admin/users/detail?id=${u.id}`,
      });
    }
    for (const c of courses ?? []) {
      out.push({
        id: `c:${c.id}`,
        kind: "course",
        at: c.createdAt,
        title: `“${c.title}” added`,
        detail: [c.lecturer, c.organization].filter(Boolean).join(" · ") || undefined,
        href: `/admin/courses/detail?slug=${c.slug}`,
      });
    }
    for (const r of reviews ?? []) {
      out.push({
        id: `r:${r.id}`,
        kind: "review",
        at: r.createdAt,
        title: `${r.author.name} reviewed “${r.course.title}”`,
        detail: r.body.length > 120 ? `${r.body.slice(0, 120)}…` : r.body,
        href: `/admin/courses/detail?slug=${r.course.slug}`,
      });
    }
    for (const p of payments ?? []) {
      out.push({
        id: `p:${p.id}`,
        kind: "payment",
        at: p.createdAt,
        title: `${p.user.name} submitted ${p.planName.replace(/_/g, " ")}`,
        detail: `${p.amount.toLocaleString("en-US")} ${p.currency} · ${p.paymentMethod} · ${p.status}`,
        href: `/admin/users/detail?id=${p.user.id}`,
      });
    }

    return out.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [users, courses, reviews, payments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (kind !== "all" && e.kind !== kind) return false;
      if (q && !`${e.title} ${e.detail ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, kind, query]);

  const visible = filtered.slice(0, limit);

  // Day headers turn a flat list into something you can scan by date.
  const grouped = useMemo(() => {
    const days: { day: string; items: Event[] }[] = [];
    for (const e of visible) {
      const day = new Date(e.at).toDateString();
      const last = days[days.length - 1];
      if (last && last.day === day) last.items.push(e);
      else days.push({ day, items: [e] });
    }
    return days;
  }, [visible]);

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const dayLabel = (day: string) =>
    day === today ? "Today" : day === yesterday ? "Yesterday" : formatDate(new Date(day).toISOString());

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Activity log</h1>
          <p className="page-desc">
            Signups, new courses, reviews and payment submissions on one timeline, newest first.
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <span className="admin-search">
          <Search size={14} />
          <input
            className="admin-input"
            placeholder="Search the log…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(SHOW_STEP);
            }}
            aria-label="Search activity"
          />
        </span>
        <div className="admin-seg" role="group" aria-label="Filter activity">
          {KINDS.map(([val, label]) => (
            <button
              key={val}
              type="button"
              aria-pressed={kind === val}
              onClick={() => {
                setKind(val);
                setLimit(SHOW_STEP);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="admin-toolbar__count">
          {loading ? "Loading…" : `${filtered.length.toLocaleString("en-US")} events`}
        </span>
      </div>

      {loading && (
        <div className="admin-card admin-stack" style={{ gap: 10 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="admin-skeleton" style={{ height: 22, display: "block" }} />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="admin-card">
          <AdminEmpty
            icon={<History size={18} />}
            title="Nothing matches those filters"
            hint="The log is built from signups, courses, reviews and payments — pick Everything to see all four."
            action={{
              label: "Clear filters",
              onClick: () => {
                setKind("all");
                setQuery("");
              },
            }}
          />
        </div>
      )}

      {!loading &&
        grouped.map((group) => (
          <div key={group.day} style={{ marginBottom: 14 }}>
            <div className="admin-section-head">
              <h2>{dayLabel(group.day)}</h2>
              <span className="admin-section-head__hint">
                {plural(group.items.length, "event")}
              </span>
            </div>
            <div className="admin-card">
              <ul className="admin-activity">
                {group.items.map((e) => (
                  <li key={e.id}>
                    <span className={`admin-activity__dot admin-activity__dot--${e.kind}`} />
                    <div className="admin-activity__main">
                      {e.href ? (
                        <Link href={e.href} className="admin-cell-link">
                          {e.title}
                        </Link>
                      ) : (
                        <div>{e.title}</div>
                      )}
                      {e.detail && <div className="admin-activity__detail">{e.detail}</div>}
                      <time dateTime={e.at}>{relativeTime(e.at)}</time>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}

      {!loading && filtered.length > visible.length && (
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          onClick={() => setLimit((l) => l + SHOW_STEP)}
        >
          Show {Math.min(SHOW_STEP, filtered.length - visible.length)} more
        </button>
      )}

      <p className="admin-section-head__hint" style={{ marginTop: 12 }}>
        Signups and courses are complete. Reviews and payments come from the 100 most recent of each, so the log thins
        out the further back you scroll. This is a feed of what users did — staff actions are not recorded anywhere yet.
      </p>
    </div>
  );
}
