"use client";

import { useEffect, useState } from "react";
import { get, patch } from "@/lib/api";
import type { AdminPaymentRow } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useToast } from "@/lib/useToast";

export default function AdminPayments() {
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast, setToast } = useToast();

  useEffect(() => {
    get<AdminPaymentRow[]>("/admin/payments")
      .then(setPayments)
      .catch((e) => setToast(e.message));
  }, [setToast]);

  const review = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id);
    try {
      const res = await patch<{ status: string; message: string }>(`/admin/payments/${id}`, { status });
      setPayments((p) => p.map((x) => (x.id === id ? { ...x, status: res.status } : x)));
      setToast(res.message);
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const pending = payments.filter((p) => p.status === "pending");

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Payments</h1>
          <p className="page-desc">
            {pending.length} pending confirmation(s) — approving upgrades the user to Premium automatically.
          </p>
        </div>
      </div>

      <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
        {payments.length === 0 && (
          <p style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            No payments yet.
          </p>
        )}
        {payments.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#fff" }}>
                {p.user.name}{" "}
                <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.45)" }}>({p.user.email})</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                {p.planName.replace("_", " ")} · {p.paymentMethod} · {p.amount} {p.currency} ·{" "}
                {formatDate(p.createdAt)}
              </div>
              {p.references.length > 0 && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  Ref: {p.references.map((r) => r.reference).join(", ")}
                </div>
              )}
            </div>
            <span
              className={`admin-badge ${
                p.status === "approved"
                  ? "admin-badge--green"
                  : p.status === "rejected"
                    ? "admin-badge--red"
                    : "admin-badge--accent"
              }`}
            >
              {p.status.toUpperCase()}
            </span>
            {p.status === "pending" && (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => review(p.id, "approved")}
                  disabled={busyId === p.id}
                  className="admin-btn admin-btn--success"
                >
                  {busyId === p.id ? "…" : "Approve"}
                </button>
                <button
                  onClick={() => review(p.id, "rejected")}
                  disabled={busyId === p.id}
                  className="admin-btn admin-btn--danger"
                >
                  Reject
                </button>
              </div>
            )}
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
