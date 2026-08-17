"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { get } from "@/lib/api";
import type { AdminStats, AdminActivityEvent } from "@/lib/types";
import { formatDate } from "@/lib/format";

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activity, setActivity] = useState<AdminActivityEvent[]>([]);

  useEffect(() => {
    Promise.all([get<AdminStats>("/admin/stats"), get<AdminActivityEvent[]>("/admin/activity")])
      .then(([s, a]) => {
        setStats(s);
        setActivity(a);
      })
      .catch(() => {});
  }, []);

  const cards = stats
    ? [
        { label: "Courses", value: stats.courses },
        { label: "Users", value: stats.users },
        { label: "Premium subscribers", value: stats.premiumSubscribers },
        { label: "Revenue (30d)", value: `$${Math.round(stats.revenue30d)}` },
        { label: "Reviews (30d)", value: stats.reviews7d },
        { label: "Pending payments", value: stats.pendingPayments, urgent: true },
      ]
    : [];

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-desc">Platform overview — what's happening on Syncourse right now.</p>
        </div>
      </div>

      {stats ? (
        <div className="admin-stat-grid">
          {cards.map((c) => (
            <div key={c.label} className={`admin-stat-card ${c.urgent ? "admin-stat-card--urgent" : ""}`}>
              <strong>{c.value}</strong>
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-stat-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-stat-card" style={{ opacity: 0.4 }}>
              <strong>—</strong>
              <span>Loading…</span>
            </div>
          ))}
        </div>
      )}

      <div className="admin-quick-links">
        <Link href="/admin/courses/new">+ New course</Link>
        <Link href="/admin/payments">Pending payment confirmations</Link>
        <Link href="/admin/reviews">Reviews & discussion</Link>
      </div>

      <div className="admin-card" style={{ marginTop: 20 }}>
        <h3>Recent activity</h3>
        {activity.length === 0 ? (
          <p className="text-dim" style={{ fontSize: 13 }}>
            No activity yet.
          </p>
        ) : (
          <ul className="admin-activity">
            {activity.map((e, i) => (
              <li key={i}>
                <span className={`admin-activity__dot admin-activity__dot--${e.type}`} />
                <div>
                  <div>{e.title}</div>
                  {e.detail && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{e.detail}</div>}
                  <time>{formatDate(e.createdAt)}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
