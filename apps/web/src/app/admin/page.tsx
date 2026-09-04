"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CircleDollarSign,
  Crown,
  MessageSquare,
  Plus,
  Star,
  Users,
} from "lucide-react";
import { get } from "@/lib/api";
import type { AdminActivityEvent, AdminCourseRow, AdminPaymentRow, AdminStats, AdminUserRow } from "@/lib/types";
import {
  bucketByDate,
  bucketBySum,
  compactNumber,
  percentChange,
  periodDelta,
  relativeTime,
} from "@/lib/metrics";
import AdminEmpty from "@/components/admin/AdminEmpty";
import StatTile from "@/components/admin/StatTile";

const DAY_MS = 86_400_000;
const WINDOW = 30;

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activity, setActivity] = useState<AdminActivityEvent[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [courses, setCourses] = useState<AdminCourseRow[]>([]);
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);

  // Tiles render from /admin/stats; the row pulls only add shape (sparklines) and
  // prior-period comparisons, so each one failing degrades a trend rather than
  // the page.
  useEffect(() => {
    get<AdminStats>("/admin/stats").then(setStats).catch(() => {});
    get<AdminActivityEvent[]>("/admin/activity").then(setActivity).catch(() => {});
    get<AdminUserRow[]>("/admin/users").then(setUsers).catch(() => {});
    get<AdminCourseRow[]>("/admin/courses").then(setCourses).catch(() => {});
    get<AdminPaymentRow[]>("/admin/payments").then(setPayments).catch(() => {});
  }, []);

  const trends = useMemo(() => {
    const signupDates = users.map((u) => u.createdAt);
    const courseDates = courses.map((c) => c.createdAt);
    const pendingDates = payments.filter((p) => p.status === "pending").map((p) => p.createdAt);
    const approved = payments.filter((p) => p.status === "approved");

    // Revenue needs a value-weighted delta, not a row count.
    const cut = Date.now() - WINDOW * DAY_MS;
    const prevCut = Date.now() - 2 * WINDOW * DAY_MS;
    const sumBetween = (from: number, to: number) =>
      approved
        .filter((p) => {
          const t = new Date(p.createdAt).getTime();
          return t >= from && t < to;
        })
        .reduce((acc, p) => acc + p.amount, 0);

    return {
      revenue: bucketBySum(approved.map((p) => ({ date: p.createdAt, value: p.amount }))),
      revenueDelta: {
        pct: percentChange(sumBetween(cut, Infinity), sumBetween(prevCut, cut)),
        period: `previous ${WINDOW} days`,
        upIsGood: true,
      },
      signups: bucketByDate(signupDates),
      signupDelta: periodDelta(signupDates, WINDOW),
      publishes: bucketByDate(courseDates),
      publishDelta: periodDelta(courseDates, WINDOW),
      pending: bucketByDate(pendingDates),
      // A growing queue of unreviewed payments is bad news, so up is not good here.
      pendingDelta: periodDelta(pendingDates, WINDOW, { upIsGood: false }),
    };
  }, [users, courses, payments]);

  const attention = useMemo(() => {
    const unverified = users.filter((u) => !u.isVerified).length;
    const softDeleted = courses.filter((c) => c.deleted).length;
    const noThumb = courses.filter((c) => !c.deleted && !c.thumbnailUrl).length;
    return [
      {
        label: "Payments awaiting review",
        value: stats?.pendingPayments ?? 0,
        href: "/admin/payments",
        bad: (stats?.pendingPayments ?? 0) > 0,
      },
      { label: "Accounts never verified", value: unverified, href: "/admin/users", bad: false },
      { label: "Courses missing a cover", value: noThumb, href: "/admin/courses", bad: false },
      { label: "Soft-deleted courses", value: softDeleted, href: "/admin/courses", bad: false },
    ];
  }, [stats, users, courses]);

  const premiumShare =
    stats && stats.users > 0 ? `${((stats.premiumSubscribers / stats.users) * 100).toFixed(1)}% of accounts` : "";

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-desc">
            Platform health at a glance. Every trend compares the last {WINDOW} days with the {WINDOW} before it.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <Link href="/admin/courses/new" className="admin-btn admin-btn--primary">
            <Plus size={13} /> New course
          </Link>
        </div>
      </div>

      {stats ? (
        <div className="admin-stat-grid">
          <StatTile
            label={`Revenue · last ${WINDOW} days`}
            value={compactNumber(stats.revenue30d)}
            icon={<CircleDollarSign size={13} />}
            delta={trends.revenueDelta}
            trend={trends.revenue}
            href="/admin/payments"
          />
          <StatTile
            label="Total users"
            value={compactNumber(stats.users)}
            icon={<Users size={13} />}
            delta={trends.signupDelta}
            trend={trends.signups}
            href="/admin/users"
          />
          <StatTile
            label="Premium subscribers"
            value={compactNumber(stats.premiumSubscribers)}
            icon={<Crown size={13} />}
            foot={premiumShare}
            href="/admin/users"
          />
          <StatTile
            label="Payments awaiting review"
            value={compactNumber(stats.pendingPayments)}
            icon={<AlertTriangle size={13} />}
            delta={trends.pendingDelta}
            trend={trends.pending}
            attn={stats.pendingPayments > 0}
            href="/admin/payments"
          />
        </div>
      ) : (
        <div className="admin-stat-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="admin-tile">
              <span className="admin-skeleton" style={{ width: 92, height: 11 }} />
              <span className="admin-skeleton" style={{ width: 66, height: 25 }} />
              <span className="admin-skeleton" style={{ width: 108, height: 10 }} />
            </div>
          ))}
        </div>
      )}

      <p className="admin-section-head__hint" style={{ marginTop: 10, maxWidth: 780, lineHeight: 1.6 }}>
        Sparklines cover the last {WINDOW} days in 12 buckets. Revenue and payment trends read the 100 most recent
        payments — the totals above come from the full ledger. Revenue carries no currency symbol on purpose: the API
        adds ETB and USD amounts into one figure, so{" "}
        <Link href="/admin/analytics" className="admin-cell-link">
          Analytics
        </Link>{" "}
        splits it per currency instead.
      </p>

      <div className="admin-section-head">
        <h2>Catalogue &amp; community</h2>
        <Link href="/admin/analytics" className="admin-section-head__hint">
          Full analytics →
        </Link>
      </div>

      <div className="admin-stat-grid">
        <StatTile
          label="Published courses"
          value={compactNumber(stats?.courses ?? 0)}
          icon={<BookOpen size={13} />}
          delta={courses.length ? trends.publishDelta : undefined}
          trend={courses.length ? trends.publishes : undefined}
          href="/admin/courses"
        />
        <StatTile
          label={`Reviews · last ${WINDOW} days`}
          value={compactNumber(stats?.reviews7d ?? 0)}
          icon={<Star size={13} />}
          foot={`${compactNumber(stats?.reviewsTotal ?? 0)} all time`}
          href="/admin/reviews"
        />
        <StatTile
          label="Collection lists"
          value={compactNumber(stats?.lists ?? 0)}
          icon={<MessageSquare size={13} />}
          foot="Curated by users"
        />
        <StatTile
          label="Study circles"
          value={compactNumber(stats?.circles ?? 0)}
          icon={<Users size={13} />}
          foot="Group learning spaces"
        />
      </div>

      <div className="admin-grid-2" style={{ marginTop: 22 }}>
        <div className="admin-card admin-card--flush">
          <div className="admin-card__head">
            <h3>Recent activity</h3>
            <Link href="/admin/activity" className="admin-section-head__hint">
              View all →
            </Link>
          </div>
          <div style={{ padding: "6px 16px 14px" }}>
            {activity.length === 0 ? (
              <AdminEmpty
                icon={<Activity size={18} />}
                title="Nothing has happened yet"
                hint="Signups, publishes, reviews and payments all land here as they happen."
              />
            ) : (
              <ul className="admin-activity">
                {activity.slice(0, 8).map((e, i) => (
                  <li key={i}>
                    <span className={`admin-activity__dot admin-activity__dot--${e.type}`} />
                    <div className="admin-activity__main">
                      <div>{e.title}</div>
                      {e.detail && <div className="admin-activity__detail">{e.detail}</div>}
                      <time dateTime={e.createdAt}>{relativeTime(e.createdAt)}</time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="admin-stack">
          <div className="admin-card">
            <h3>Needs attention</h3>
            <div className="admin-stack" style={{ gap: 8 }}>
              {attention.map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className="admin-inline"
                  style={{ justifyContent: "space-between", textDecoration: "none", color: "inherit" }}
                >
                  <span style={{ fontSize: 12 }}>{a.label}</span>
                  <span className={`admin-badge ${a.bad ? "admin-badge--warn" : "admin-badge--gray"}`}>{a.value}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="admin-card">
            <h3>Shortcuts</h3>
            <div className="admin-quick-links">
              <Link href="/admin/courses/new">
                <Plus size={13} /> New course
              </Link>
              <Link href="/admin/payments">
                <CircleDollarSign size={13} /> Payment queue
              </Link>
              <Link href="/admin/reviews">
                <Star size={13} /> Moderate reviews
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
