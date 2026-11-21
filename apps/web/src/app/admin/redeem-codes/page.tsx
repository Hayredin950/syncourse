"use client";

import { useEffect, useState } from "react";
import { Copy, Gift, Plus } from "lucide-react";
import { del, get, post } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminEmpty from "@/components/admin/AdminEmpty";
import ConfirmButton from "@/components/admin/ConfirmButton";

interface RedeemRow {
  id: string;
  code: string;
  planName: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
  redemptions: { userName: string; username: string; redeemedAt: string }[];
}

const PLANS = [
  { id: "1m", label: "1 Month" },
  { id: "3m", label: "3 Months" },
  { id: "6m", label: "6 Months" },
];

export default function AdminRedeemCodes() {
  const toast = useAdminToast();
  const [rows, setRows] = useState<RedeemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [planName, setPlanName] = useState("1m");
  const [maxUses, setMaxUses] = useState(1);
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    get<RedeemRow[]>("/admin/redeem-codes")
      .then(setRows)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const r = await post<{ id: string; code: string }>("/admin/redeem-codes", {
        planName,
        maxUses,
        code: code.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      toast.success(`Code ${r.code} created`);
      setCode("");
      setExpiresAt("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the code");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (row: RedeemRow) => {
    setBusyId(row.id);
    try {
      await del(`/admin/redeem-codes/${row.id}`);
      setRows((p) => p.filter((x) => x.id !== row.id));
      toast.success(`Code ${row.code} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the code");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Gift codes</h1>
          <p className="page-desc">
            Generate a code that extends Premium when a reader redeems it on the Premium page or in
            their profile. Uses are claimed atomically, so the last use cannot be spent twice.
          </p>
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: 18 }}>
        <h2 style={{ marginTop: 0, fontSize: 14 }}>Create a code</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label className="admin-field" style={{ minWidth: 150 }}>
            <span>Plan</span>
            <select className="admin-input" value={planName} onChange={(e) => setPlanName(e.target.value)}>
              {PLANS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="admin-field" style={{ width: 110 }}>
            <span>Max uses</span>
            <input
              className="admin-input"
              type="number"
              min={1}
              max={1000}
              value={maxUses}
              onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="admin-field" style={{ minWidth: 170 }}>
            <span>Code (optional)</span>
            <input
              className="admin-input"
              placeholder="Leave blank to generate"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <label className="admin-field" style={{ minWidth: 160 }}>
            <span>Expires (optional)</span>
            <input className="admin-input" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>
          <button className="admin-btn admin-btn--primary" onClick={() => void create()} disabled={creating}>
            <Plus size={14} /> {creating ? "Creating…" : "Create code"}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>
          A code can be redeemed once per account. Its plan length is added to whatever time is left.
        </p>
      </div>

      <div className="admin-card admin-card--flush">
        {loading ? (
          <div className="admin-empty">Loading codes…</div>
        ) : rows.length === 0 ? (
          <AdminEmpty
            icon={<Gift size={28} />}
            title="No gift codes yet"
            hint="Create one above for a promotion, a referral reward or a support gesture."
          />
        ) : (
          <div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Plan</th>
                  <th>Uses</th>
                  <th>Expires</th>
                  <th>Created</th>
                  <th>Recent redemptions</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="mono" style={{ fontWeight: 700 }}>{r.code}</span>
                      <button
                        className="admin-icon-btn"
                        title="Copy code"
                        onClick={() => {
                          void navigator.clipboard?.writeText(r.code);
                          toast.success("Code copied");
                        }}
                      >
                        <Copy size={12} />
                      </button>
                    </td>
                    <td>{PLANS.find((p) => p.id === r.planName)?.label ?? r.planName}</td>
                    <td>{r.usedCount} / {r.maxUses}</td>
                    <td>{r.expiresAt ? formatDate(r.expiresAt) : "Never"}</td>
                    <td>{formatDate(r.createdAt)}</td>
                    <td className="muted" style={{ fontSize: 11 }}>
                      {r.redemptions.length === 0
                        ? "—"
                        : r.redemptions.map((x) => `${x.userName} (@${x.username})`).join(", ")}
                    </td>
                    <td>
                      <ConfirmButton
                        onConfirm={() => void remove(r)}
                        label=""
                        icon
                        ariaLabel={`Delete code ${r.code}`}
                        question="Delete this code?"
                        busy={busyId === r.id}
                        className="admin-btn admin-btn--ghost admin-btn--sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
