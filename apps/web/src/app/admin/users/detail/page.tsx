"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CircleDollarSign,
  Copy,
  ShieldCheck,
  ShieldOff,
  Star,
  UserSearch,
} from "lucide-react";
import { get, patch } from "@/lib/api";
import type { AdminPaymentRow, AdminReviewRow, AdminUserRow } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { moneyByCurrency, relativeTime } from "@/lib/metrics";
import { useAuth } from "@/lib/auth";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminAvatar from "@/components/admin/AdminAvatar";
import AdminEmpty from "@/components/admin/AdminEmpty";
import ConfirmButton from "@/components/admin/ConfirmButton";
import ExpandableText from "@/components/admin/ExpandableText";

/**
 * Account drill-down.
 *
 * A query-param route rather than /admin/users/[id]: the web app is a static
 * export, so a dynamic segment would need every user id enumerated at build
 * time — which is both impossible and something we would not want in a public
 * bundle. ?id= keeps the ids where they belong, behind the admin API.
 *
 * The API has no per-user endpoint, so this composes the three list endpoints it
 * does have. Two of them are capped at 100 rows server-side, so this page says
 * so on screen instead of quietly showing a partial history as if it were whole.
 */
export default function AdminUserDetailPage() {
  return (
    <Suspense fallback={<div className="admin-skeleton" style={{ height: 220, display: "block" }} />}>
      <UserDetail />
    </Suspense>
  );
}

function UserDetail() {
  const id = useSearchParams().get("id");
  const { user: me } = useAuth();
  const toast = useAdminToast();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [reviews, setReviews] = useState<AdminReviewRow[]>([]);
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<AdminUserRow[]>("/admin/users")
      .then(setUsers)
      .catch(() => setUsers([]));
    get<AdminReviewRow[]>("/admin/reviews").then(setReviews).catch(() => {});
    get<AdminPaymentRow[]>("/admin/payments").then(setPayments).catch(() => {});
  }, []);

  const account = users?.find((u) => u.id === id) ?? null;
  const mine = useMemo(() => {
    if (!id) return { reviews: [], payments: [], spend: "—" };
    const rs = reviews.filter((r) => r.author.id === id);
    const ps = payments.filter((p) => p.user.id === id);
    return {
      reviews: rs,
      payments: ps,
      spend: moneyByCurrency(ps.filter((p) => p.status === "approved")),
    };
  }, [id, reviews, payments]);

  const setRole = async (isStaff: boolean) => {
    if (!account) return;
    setBusy(true);
    try {
      const res = await patch<{ isStaff: boolean; message: string }>(`/admin/users/${account.id}/role`, { isStaff });
      setUsers((p) => (p ?? []).map((x) => (x.id === account.id ? { ...x, isStaff: res.isStaff } : x)));
      toast.success(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change that role");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("The browser blocked clipboard access");
    }
  };

  if (!id) {
    return (
      <div>
        <Link href="/admin/users" className="admin-back">
          <ArrowLeft size={13} /> Users
        </Link>
        <div className="admin-card">
          <AdminEmpty
            icon={<UserSearch size={18} />}
            title="No account was specified"
            hint="This page needs an account id. Open one from the users list."
            action={{ label: "Browse users", href: "/admin/users" }}
          />
        </div>
      </div>
    );
  }

  if (users === null) {
    return (
      <div>
        <Link href="/admin/users" className="admin-back">
          <ArrowLeft size={13} /> Users
        </Link>
        <div className="admin-stack">
          <span className="admin-skeleton" style={{ height: 46, width: 280, display: "block" }} />
          <span className="admin-skeleton" style={{ height: 150, display: "block" }} />
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div>
        <Link href="/admin/users" className="admin-back">
          <ArrowLeft size={13} /> Users
        </Link>
        <div className="admin-card">
          <AdminEmpty
            icon={<UserSearch size={18} />}
            title="No account with that id"
            hint="It may have been removed since the link was made."
            action={{ label: "Browse users", href: "/admin/users" }}
          />
        </div>
      </div>
    );
  }

  const isSelf = account.id === me?.id;

  return (
    <div>
      <Link href="/admin/users" className="admin-back">
        <ArrowLeft size={13} /> Users
      </Link>

      <div className="admin-page-head">
        <div className="admin-detail-head">
          <AdminAvatar src={account.avatarUrl} name={account.name} />
          <div>
            <h1 className="admin-inline" style={{ gap: 7 }}>
              {account.name}
              {account.isStaff && <span className="admin-badge admin-badge--blue">Staff</span>}
              {account.planType === "premium" && <span className="admin-badge admin-badge--violet">Premium</span>}
              {isSelf && <span className="admin-badge admin-badge--gray">You</span>}
            </h1>
            <p className="page-desc">
              {account.email} · @{account.username} · joined {formatDate(account.createdAt)}
            </p>
          </div>
        </div>
        <div className="admin-page-head__actions">
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={() => copy(account.email, "Email address")}
          >
            <Copy size={13} /> Copy email
          </button>
          {!isSelf &&
            (account.isStaff ? (
              <ConfirmButton
                label="Revoke staff"
                question="Remove admin access?"
                confirmLabel="Yes, revoke"
                busy={busy}
                icon={false}
                className="admin-btn admin-btn--danger"
                onConfirm={() => setRole(false)}
              />
            ) : (
              <button type="button" className="admin-btn" disabled={busy} onClick={() => setRole(true)}>
                <ShieldCheck size={13} /> Make staff
              </button>
            ))}
        </div>
      </div>

      <div className="admin-minitiles" style={{ marginBottom: 14 }}>
        <div className="admin-minitile">
          <strong>{account.downloads.toLocaleString("en-US")}</strong>
          <span>Downloads</span>
        </div>
        <div className="admin-minitile">
          <strong>{account.reviews.toLocaleString("en-US")}</strong>
          <span>Reviews</span>
        </div>
        <div className="admin-minitile">
          <strong>{account.lists.toLocaleString("en-US")}</strong>
          <span>Lists</span>
        </div>
      </div>

      <div className="admin-detail-grid">
        <div className="admin-stack">
          <div className="admin-card admin-card--flush">
            <div className="admin-card__head">
              <h3>
                <Star size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                Reviews
              </h3>
              <Link href="/admin/reviews" className="admin-section-head__hint">
                All reviews →
              </Link>
            </div>
            {mine.reviews.length === 0 ? (
              <AdminEmpty
                icon={<Star size={18} />}
                title={account.reviews > 0 ? "None in the recent window" : "No reviews written"}
                hint={
                  account.reviews > 0
                    ? `This account has written ${account.reviews.toLocaleString("en-US")}, but none are in the 100 most recent across the platform.`
                    : "Reviews are written from course pages on the site."
                }
              />
            ) : (
              <div>
                {mine.reviews.map((r) => (
                  <div key={r.id} className="admin-row admin-row--top">
                    <div className="admin-row__main">
                      <Link href={`/admin/courses/detail?slug=${r.course.slug}`} className="admin-row__title">
                        {r.course.title}
                      </Link>
                      <ExpandableText text={r.body} className="admin-row__body" />
                      <div className="admin-row__meta">
                        {relativeTime(r.createdAt)} · {r.upvoteCount} upvotes · {r.replyCount} replies
                        {r.containsSpoilers && " · flagged spoilers"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-card admin-card--flush">
            <div className="admin-card__head">
              <h3>
                <CircleDollarSign size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
                Payments
              </h3>
              <Link href="/admin/payments" className="admin-section-head__hint">
                Payment queue →
              </Link>
            </div>
            {mine.payments.length === 0 ? (
              <AdminEmpty
                icon={<CircleDollarSign size={18} />}
                title="No payments on record"
                hint="Nothing for this account in the 100 most recent payments platform-wide."
              />
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Method</th>
                    <th className="admin-table__num">Amount</th>
                    <th>Status</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="admin-cell-title" data-role="head">
                        {p.planName}
                      </td>
                      <td className="admin-table__quiet" data-label="Method">
                        {p.paymentMethod}
                      </td>
                      <td className="admin-table__num" data-label="Amount">
                        {p.amount.toLocaleString("en-US")} {p.currency}
                      </td>
                      <td data-label="Status">
                        <PaymentStatus status={p.status} />
                      </td>
                      <td className="admin-table__quiet" data-label="Submitted">
                        {formatDate(p.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="admin-stack">
          <div className="admin-card">
            <h3>Account</h3>
            <dl className="admin-kv">
              <dt>Plan</dt>
              <dd>{account.planType === "premium" ? "Premium" : "Free"}</dd>
              <dt>Email status</dt>
              <dd>
                {account.isVerified ? (
                  <span className="admin-status admin-status--good">
                    <BadgeCheck size={12} /> Verified
                  </span>
                ) : (
                  <span className="admin-status admin-status--idle">Never verified</span>
                )}
              </dd>
              <dt>Role</dt>
              <dd>
                {account.isStaff ? (
                  <span className="admin-status admin-status--good">
                    <ShieldCheck size={12} /> Staff
                  </span>
                ) : (
                  <span className="admin-status admin-status--idle">
                    <ShieldOff size={12} /> Member
                  </span>
                )}
              </dd>
              <dt>Approved spend</dt>
              <dd>{mine.spend}</dd>
              <dt>Joined</dt>
              <dd>{formatDate(account.createdAt)}</dd>
              <dt>Username</dt>
              <dd>@{account.username}</dd>
              <dt>User id</dt>
              <dd>
                <button
                  type="button"
                  className="admin-btn admin-btn--quiet admin-btn--sm"
                  onClick={() => copy(account.id, "User id")}
                  style={{ fontFamily: "var(--app-font-mono)", fontSize: 11 }}
                >
                  {account.id}
                </button>
              </dd>
            </dl>
          </div>

          <div className="admin-card">
            <h3>Where this comes from</h3>
            <p className="page-desc" style={{ margin: 0 }}>
              Counts and account fields come from the full user record. The reviews and payments below are drawn from
              the 100 most recent of each across the whole platform, so a long-standing account may show fewer rows
              here than it really has.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentStatus({ status }: { status: string }) {
  if (status === "approved")
    return (
      <span className="admin-status admin-status--good">
        <BadgeCheck size={12} /> Approved
      </span>
    );
  if (status === "rejected") return <span className="admin-status admin-status--bad">Rejected</span>;
  return <span className="admin-status admin-status--warn">Pending</span>;
}
