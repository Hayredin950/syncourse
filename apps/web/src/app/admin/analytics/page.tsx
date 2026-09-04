"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CircleDollarSign, Crown, Users } from "lucide-react";
import { get } from "@/lib/api";
import type { AdminCourseRow, AdminPaymentRow, AdminReviewRow, AdminStats, AdminUserRow } from "@/lib/types";
import { bucketSeries, compactNumber, periodDelta, runningTotal, sumSince, windowDelta } from "@/lib/metrics";
import StatTile from "@/components/admin/StatTile";
import TimeChart from "@/components/admin/TimeChart";
import ChartCard from "@/components/admin/ChartCard";
import AdminEmpty from "@/components/admin/AdminEmpty";
import BarList from "@/components/admin/BarList";

/**
 * Analytics.
 *
 * Every number here is derived in the browser from the four admin list
 * endpoints — there is no historical analytics endpoint, and adding one is a
 * backend change. Two consequences the page states out loud rather than hiding:
 * reviews and payments arrive as the 100 most recent of each, so anything drawn
 * from them thins out as the range widens; and payments carry a currency, so ETB
 * and USD are charted separately instead of being added into a meaningless total
 * the way /admin/stats does.
 */
const DAY_MS = 86_400_000;

const RANGES = [
  { days: 30, label: "30 days", buckets: 15, monthly: false },
  { days: 90, label: "90 days", buckets: 15, monthly: false },
  { days: 365, label: "12 months", buckets: 12, monthly: true },
];

export default function AdminAnalytics() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [courses, setCourses] = useState<AdminCourseRow[] | null>(null);
  const [payments, setPayments] = useState<AdminPaymentRow[] | null>(null);
  const [reviews, setReviews] = useState<AdminReviewRow[] | null>(null);
  const [rangeIdx, setRangeIdx] = useState(0);
  const [currency, setCurrency] = useState<string | null>(null);

  // Independent failures: losing the payment pull should cost the revenue charts
  // and nothing else.
  useEffect(() => {
    get<AdminStats>("/admin/stats").then(setStats).catch(() => {});
    get<AdminUserRow[]>("/admin/users").then(setUsers).catch(() => setUsers([]));
    get<AdminCourseRow[]>("/admin/courses").then(setCourses).catch(() => setCourses([]));
    get<AdminPaymentRow[]>("/admin/payments").then(setPayments).catch(() => setPayments([]));
    get<AdminReviewRow[]>("/admin/reviews").then(setReviews).catch(() => setReviews([]));
  }, []);

  const loading = users === null || courses === null || payments === null || reviews === null;
  const range = RANGES[rangeIdx];
  const bucketOpts = useMemo(
    () => ({
      days: range.days,
      buckets: range.buckets,
      label: range.monthly
        ? (d: Date) => d.toLocaleDateString("en-US", { month: "short" })
        : (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    }),
    [range],
  );

  const approved = useMemo(() => (payments ?? []).filter((p) => p.status === "approved"), [payments]);
  const currencies = useMemo(
    () => [...new Set(approved.map((p) => p.currency))].sort((a, b) => a.localeCompare(b)),
    [approved],
  );
  const cur = currency && currencies.includes(currency) ? currency : (currencies[0] ?? "ETB");
  const money = (v: number) => `${compactNumber(v)} ${cur}`;

  const revenue = useMemo(() => {
    const rows = approved.filter((p) => p.currency === cur).map((p) => ({ date: p.createdAt, value: p.amount }));
    return {
      series: bucketSeries(rows, bucketOpts),
      counts: bucketSeries(rows.map((r) => ({ date: r.date })), bucketOpts),
      total: sumSince(rows, range.days),
      delta: windowDelta(rows, range.days),
    };
  }, [approved, cur, bucketOpts, range.days]);

  const signups = useMemo(() => {
    const dates = (users ?? []).map((u) => u.createdAt);
    const series = bucketSeries(dates.map((d) => ({ date: d })), bucketOpts);
    const before = dates.filter((d) => new Date(d).getTime() < Date.now() - range.days * DAY_MS).length;
    return {
      series,
      // A cumulative line needs the accounts that already existed when the window
      // opened, or it draws the platform as younger than it is.
      cumulative: runningTotal(series.map((b) => b.value), before).map((v, i) => ({
        label: series[i].label,
        value: v,
      })),
      total: dates.filter((d) => new Date(d).getTime() >= Date.now() - range.days * DAY_MS).length,
      delta: periodDelta(dates, range.days),
    };
  }, [users, bucketOpts, range.days]);

  const published = useMemo(() => {
    const dates = (courses ?? []).map((c) => c.createdAt);
    return {
      series: bucketSeries(dates.map((d) => ({ date: d })), bucketOpts),
      total: dates.filter((d) => new Date(d).getTime() >= Date.now() - range.days * DAY_MS).length,
      delta: periodDelta(dates, range.days),
    };
  }, [courses, bucketOpts, range.days]);

  const reviewSeries = useMemo(
    () => bucketSeries((reviews ?? []).map((r) => ({ date: r.createdAt })), bucketOpts),
    [reviews, bucketOpts],
  );

  const topCourses = useMemo(
    () =>
      (courses ?? [])
        .filter((c) => !c.deleted)
        .sort((a, b) => b.downloadCount - a.downloadCount)
        .slice(0, 8)
        .map((c) => ({
          label: c.title,
          value: c.downloadCount,
          href: `/admin/courses/detail?slug=${c.slug}`,
          hint: c.ratingAvg > 0 ? `${c.ratingAvg.toFixed(1)}★` : undefined,
        })),
    [courses],
  );

  const topPublishers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of courses ?? []) {
      if (c.deleted || !c.organization) continue;
      counts.set(c.organization, (counts.get(c.organization) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }));
  }, [courses]);

  const methods = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of payments ?? []) counts.set(p.paymentMethod, (counts.get(p.paymentMethod) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label: label.replace(/_/g, " "), value }));
  }, [payments]);

  const funnel = useMemo(() => {
    const all = users ?? [];
    const rows = [
      { label: "Accounts", value: all.length },
      { label: "Verified email", value: all.filter((u) => u.isVerified).length },
      { label: "Downloaded a course", value: all.filter((u) => u.downloads > 0).length },
      { label: "Wrote a review", value: all.filter((u) => u.reviews > 0).length },
      { label: "On a paid plan", value: all.filter((u) => u.planType !== "free").length },
    ];
    return rows.map((r) => ({
      ...r,
      hint: all.length ? `${((r.value / all.length) * 100).toFixed(0)}%` : undefined,
    }));
  }, [users]);

  const cohorts = useMemo(() => {
    const map = new Map<string, { label: string; total: number; downloaded: number; paid: number }>();
    for (const u of users ?? []) {
      const d = new Date(u.createdAt);
      if (!Number.isFinite(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row =
        map.get(key) ??
        { label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }), total: 0, downloaded: 0, paid: 0 };
      row.total += 1;
      if (u.downloads > 0) row.downloaded += 1;
      if (u.planType !== "free") row.paid += 1;
      map.set(key, row);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([, v]) => v);
  }, [users]);

  const premiumShare =
    users && users.length > 0
      ? `${((users.filter((u) => u.planType !== "free").length / users.length) * 100).toFixed(1)}% of accounts`
      : "";

  const bucketSpan = range.monthly ? "a month" : `${Math.round(range.days / range.buckets)} days`;

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Analytics</h1>
          <p className="page-desc">
            Growth, revenue and engagement over time. Each point covers {bucketSpan}; deltas compare the range with the
            one immediately before it.
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-seg" role="group" aria-label="Time range">
          {RANGES.map((r, i) => (
            <button key={r.days} type="button" aria-pressed={rangeIdx === i} onClick={() => setRangeIdx(i)}>
              {r.label}
            </button>
          ))}
        </div>
        {currencies.length > 1 && (
          <div className="admin-seg" role="group" aria-label="Revenue currency">
            {currencies.map((c) => (
              <button key={c} type="button" aria-pressed={cur === c} onClick={() => setCurrency(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        <span className="admin-toolbar__count">
          {loading ? "Loading…" : `${(users ?? []).length.toLocaleString("en-US")} accounts loaded`}
        </span>
      </div>

      {loading ? (
        <div className="admin-stat-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="admin-tile">
              <span className="admin-skeleton" style={{ width: 92, height: 11 }} />
              <span className="admin-skeleton" style={{ width: 66, height: 25 }} />
              <span className="admin-skeleton" style={{ width: 108, height: 10 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-stat-grid">
          <StatTile
            label={`Revenue · ${range.label}`}
            value={money(revenue.total)}
            icon={<CircleDollarSign size={13} />}
            delta={revenue.delta}
            trend={revenue.series.map((b) => b.value)}
            href="/admin/payments"
          />
          <StatTile
            label={`New accounts · ${range.label}`}
            value={compactNumber(signups.total)}
            icon={<Users size={13} />}
            delta={signups.delta}
            trend={signups.series.map((b) => b.value)}
            href="/admin/users"
          />
          <StatTile
            label={`Courses added · ${range.label}`}
            value={compactNumber(published.total)}
            icon={<BookOpen size={13} />}
            delta={published.delta}
            trend={published.series.map((b) => b.value)}
            href="/admin/courses"
          />
          <StatTile
            label="On a paid plan"
            value={compactNumber((users ?? []).filter((u) => u.planType !== "free").length)}
            icon={<Crown size={13} />}
            foot={premiumShare}
            href="/admin/users"
          />
        </div>
      )}
      <div className="admin-section-head">
        <h2>Revenue</h2>
        <Link href="/admin/payments" className="admin-section-head__hint">
          Payment queue →
        </Link>
      </div>

      <ChartCard
        title={`Approved revenue · ${cur}`}
        hint={range.label}
        note={`Approved payments only, from the 100 most recent in the ledger. Currencies are charted one at a time — ETB and USD are never added together, which is what the dashboard's single revenue figure does.`}
        columns={["Period", `Revenue (${cur})`, "Payments"]}
        rows={revenue.series.map((b, i) => [b.label, Math.round(b.value), revenue.counts[i].value])}
      >
        <TimeChart
          points={revenue.series.map((b) => ({ label: b.label, value: b.value }))}
          kind="area"
          format={(v) => compactNumber(v)}
          ariaLabel={`Approved revenue in ${cur} over the last ${range.label}`}
        />
      </ChartCard>

      <div className="admin-section-head">
        <h2>Growth</h2>
      </div>

      <div className="admin-grid-2">
        <ChartCard
          title="New accounts"
          hint={range.label}
          columns={["Period", "Signups"]}
          rows={signups.series.map((b) => [b.label, b.value])}
        >
          <TimeChart
            points={signups.series.map((b) => ({ label: b.label, value: b.value }))}
            kind="bar"
            ariaLabel={`New accounts per ${bucketSpan} over the last ${range.label}`}
          />
        </ChartCard>

        <ChartCard
          title="Accounts, cumulative"
          hint="Including accounts older than the range"
          columns={["Period", "Accounts"]}
          rows={signups.cumulative.map((p) => [p.label, p.value])}
        >
          <TimeChart
            points={signups.cumulative}
            kind="area"
            format={(v) => compactNumber(v)}
            ariaLabel={`Total accounts over the last ${range.label}`}
          />
        </ChartCard>
      </div>
      <div className="admin-grid-2" style={{ marginTop: 14 }}>
        <ChartCard
          title="Courses added"
          hint={range.label}
          columns={["Period", "Courses"]}
          rows={published.series.map((b) => [b.label, b.value])}
        >
          <TimeChart
            points={published.series.map((b) => ({ label: b.label, value: b.value }))}
            kind="bar"
            ariaLabel={`Courses added per ${bucketSpan} over the last ${range.label}`}
          />
        </ChartCard>

        <ChartCard
          title="Reviews written"
          hint={range.label}
          note="Drawn from the 100 most recent reviews, so anything older than those falls off this chart — treat a long range as a floor, not a count."
          columns={["Period", "Reviews"]}
          rows={reviewSeries.map((b) => [b.label, b.value])}
        >
          <TimeChart
            points={reviewSeries.map((b) => ({ label: b.label, value: b.value }))}
            kind="bar"
            ariaLabel={`Reviews written per ${bucketSpan} over the last ${range.label}`}
          />
        </ChartCard>
      </div>

      <div className="admin-section-head">
        <h2>What is being used</h2>
        <span className="admin-section-head__hint">All time, not the selected range</span>
      </div>

      <div className="admin-grid-2">
        <ChartCard
          title="Top courses by downloads"
          hint="Live courses"
          columns={["Course", "Students", "Rating"]}
          rows={topCourses.map((c) => [c.label, c.value, c.hint ?? "—"])}
        >
          <BarList items={topCourses} empty="No downloads yet" />
        </ChartCard>

        <ChartCard
          title="Publishers by catalogue size"
          hint="Live courses"
          columns={["Publisher", "Courses"]}
          rows={topPublishers.map((p) => [p.label, p.value])}
        >
          <BarList items={topPublishers} empty="No course carries a publisher yet" />
        </ChartCard>
      </div>
      <div className="admin-grid-2" style={{ marginTop: 14 }}>
        <ChartCard
          title="Account funnel"
          hint="Share of all accounts"
          note="Not a sequence — an account can go premium without ever writing a review. Each bar is a share of every account on the platform."
          columns={["Step", "Accounts", "Share"]}
          rows={funnel.map((f) => [f.label, f.value, f.hint ?? "—"])}
        >
          <BarList items={funnel} max={(users ?? []).length || 1} />
        </ChartCard>

        <ChartCard
          title="Payment methods"
          hint="Submissions, any status"
          note="From the 100 most recent payments, approved or not — this is what people reach for, not what cleared."
          columns={["Method", "Submissions"]}
          rows={methods.map((m) => [m.label, m.value])}
        >
          <BarList items={methods} empty="No payment has been submitted yet" />
        </ChartCard>
      </div>

      <div className="admin-section-head">
        <h2>Activation by signup month</h2>
        <span className="admin-section-head__hint">Last 12 months with signups</span>
      </div>

      <div className="admin-card admin-card--flush">
        {cohorts.length === 0 ? (
          <AdminEmpty
            icon={<Users size={18} />}
            title="No accounts to group yet"
            hint="Cohorts are cut from signup months, so the first row appears with the first signup."
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Signed up</th>
                <th className="admin-table__num">Accounts</th>
                <th className="admin-table__num">Downloaded</th>
                <th className="admin-table__num">Paid</th>
                <th className="admin-table__num">Activation</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.label}>
                  <td className="admin-cell-title" data-role="head">
                    {c.label}
                  </td>
                  <td className="admin-table__num" data-label="Accounts">
                    {c.total.toLocaleString("en-US")}
                  </td>
                  <td className="admin-table__num" data-label="Downloaded">
                    {c.downloaded.toLocaleString("en-US")}
                  </td>
                  <td className="admin-table__num" data-label="Paid">
                    {c.paid.toLocaleString("en-US")}
                  </td>
                  <td className="admin-table__num" data-label="Activation">
                    {((c.downloaded / c.total) * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="admin-section-head__hint" style={{ marginTop: 12, maxWidth: 760, lineHeight: 1.6 }}>
        Activation is measured to date, not within a window: it is the share of that month&rsquo;s accounts that have
        downloaded at least one course at any point since. Real retention — whether they came back in month two —
        needs per-session history the API does not expose yet.
        {stats && (
          <>
            {" "}
            The platform totals from <code>/admin/stats</code> are {compactNumber(stats.users)} accounts,{" "}
            {compactNumber(stats.courses)} courses and {compactNumber(stats.reviewsTotal)} reviews all time; where a
            chart above is lower, the 100-row pull is why.
          </>
        )}
      </p>
    </div>
  );
}
