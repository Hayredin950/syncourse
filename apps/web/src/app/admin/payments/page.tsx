"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Check, CheckCheck, CreditCard, Search } from "lucide-react";
import { get, patch } from "@/lib/api";
import type { AdminPaymentRow } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { moneyByCurrency, relativeTime } from "@/lib/metrics";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminEmpty from "@/components/admin/AdminEmpty";
import ConfirmButton from "@/components/admin/ConfirmButton";
import Pagination, { clampPage } from "@/components/admin/Pagination";

export default function AdminPayments() {
  const toast = useAdminToast();
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  useEffect(() => {
    get<AdminPaymentRow[]>("/admin/payments")
      .then(setPayments)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(
    () => ({
      pending: payments.filter((p) => p.status === "pending").length,
      approved: payments.filter((p) => p.status === "approved").length,
      rejected: payments.filter((p) => p.status === "rejected").length,
    }),
    [payments],
  );

  const approvedValue = useMemo(
    () => moneyByCurrency(payments.filter((p) => p.status === "approved")),
    [payments],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments.filter((p) => {
      const refs = p.references.map((r) => r.reference).join(" ");
      if (q && !`${p.user.name} ${p.user.email} ${p.txReference ?? ""} ${refs}`.toLowerCase().includes(q)) return false;
      if (scope !== "all" && p.status !== scope) return false;
      return true;
    });
  }, [payments, query, scope]);

  const safePage = clampPage(page, filtered.length, perPage);
  const visible = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const review = async (p: AdminPaymentRow, status: "approved" | "rejected") => {
    setBusyId(p.id);
    try {
      const res = await patch<{ status: string; message: string }>(`/admin/payments/${p.id}`, { status });
      setPayments((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: res.status } : x)));
      if (status === "approved") toast.success(res.message);
      else toast.info(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update that payment");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Payments</h1>
          <p className="page-desc">
            {counts.pending === 0
              ? "The queue is clear."
              : `${counts.pending} awaiting confirmation. Approving upgrades the account to Premium automatically.`}
          </p>
        </div>
      </div>

      <div className="admin-minitiles" style={{ marginBottom: 14 }}>
        <div className={`admin-minitile ${counts.pending > 0 ? "admin-minitile--attn" : ""}`}>
          <strong>{counts.pending.toLocaleString("en-US")}</strong>
          <span>Awaiting review</span>
        </div>
        <div className="admin-minitile">
          <strong>{counts.approved.toLocaleString("en-US")}</strong>
          <span>Approved</span>
        </div>
        <div className="admin-minitile">
          <strong style={{ fontSize: 14 }}>{approvedValue}</strong>
          <span>Approved value loaded</span>
        </div>
      </div>

      <div className="admin-toolbar">
        <span className="admin-search">
          <Search size={14} />
          <input
            className="admin-input"
            placeholder="Name, email or reference…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            aria-label="Search payments"
          />
        </span>
        <div className="admin-seg" role="group" aria-label="Filter payments">
          {[
            ["pending", `Pending${counts.pending ? ` (${counts.pending})` : ""}`],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
            ["all", "All"],
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
          {filtered.length === payments.length ? `${payments.length} loaded` : `${filtered.length} of ${payments.length}`}
        </span>
      </div>

      <div className="admin-card admin-card--flush">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="admin-row">
              <span className="admin-skeleton" style={{ height: 38, flex: 1 }} />
            </div>
          ))}
        {!loading && visible.length === 0 && (
          <AdminEmpty
            icon={scope === "pending" ? <CheckCheck size={18} /> : <CreditCard size={18} />}
            title={
              scope === "pending"
                ? "Nothing is waiting for review"
                : payments.length === 0
                  ? "No payments yet"
                  : "Nothing matches those filters"
            }
            hint={
              scope === "pending"
                ? "An empty queue is the goal — every upgrade request has been answered."
                : payments.length === 0
                  ? "Manual transfers land here the moment a member submits one."
                  : "Search matches names, emails and transaction references."
            }
            action={scope === "pending" ? { label: "Show all payments", onClick: () => setScope("all") } : undefined}
          />
        )}
        {visible.map((p) => (
          <div key={p.id} className="admin-row admin-row--top">
            <div className="admin-row__main">
              <div className="admin-inline" style={{ gap: 7, flexWrap: "wrap" }}>
                <Link href={`/admin/users/detail?id=${p.user.id}`} className="admin-row__title">
                  {p.user.name}
                </Link>
                <span className="admin-dim">{p.user.email}</span>
                <PaymentStatus status={p.status} />
              </div>
              <div className="admin-row__meta">
                {p.planName.replace(/_/g, " ")} · {p.paymentMethod} · {p.amount.toLocaleString("en-US")} {p.currency} ·{" "}
                {relativeTime(p.createdAt)} <span className="admin-dim">({formatDate(p.createdAt)})</span>
              </div>
              {(p.txReference || p.references.length > 0) && (
                <div className="admin-row__meta" style={{ fontFamily: "var(--app-font-mono)" }}>
                  Ref {[p.txReference, ...p.references.map((r) => r.reference)].filter(Boolean).join(" · ")}
                </div>
              )}
              {p.user.telegramUsername && <div className="admin-row__meta">Telegram @{p.user.telegramUsername}</div>}
            </div>
            {p.status === "pending" && (
              <div className="admin-row__actions">
                <button
                  type="button"
                  className="admin-btn admin-btn--success admin-btn--sm"
                  disabled={busyId === p.id}
                  onClick={() => review(p, "approved")}
                >
                  <Check size={13} /> {busyId === p.id ? "Working…" : "Approve"}
                </button>
                <ConfirmButton
                  label="Reject"
                  question="Reject this payment?"
                  confirmLabel="Yes, reject"
                  busy={busyId === p.id}
                  icon={false}
                  className="admin-btn admin-btn--danger admin-btn--sm"
                  onConfirm={() => review(p, "rejected")}
                />
              </div>
            )}
          </div>
        ))}
        <Pagination
          page={safePage}
          perPage={perPage}
          total={filtered.length}
          onPage={setPage}
          onPerPage={setPerPage}
          noun="payments"
        />
      </div>

      <p className="admin-section-head__hint" style={{ marginTop: 10 }}>
        This list holds the 100 most recent payments, so the approved counts above describe what is loaded here rather
        than the whole ledger. The pending queue is complete as long as it stays under that mark.
      </p>
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
