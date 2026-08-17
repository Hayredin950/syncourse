"use client";

import { useEffect, useMemo, useState } from "react";
import { get, patch } from "@/lib/api";
import type { AdminUserRow } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/useToast";

export default function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast, setToast } = useToast();

  useEffect(() => {
    get<AdminUserRow[]>("/admin/users")
      .then(setUsers)
      .catch((e) => setToast(e.message));
  }, [setToast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !`${u.name} ${u.email} ${u.username}`.toLowerCase().includes(q)) return false;
      if (roleFilter === "admin" && !u.isStaff) return false;
      if (roleFilter === "user" && u.isStaff) return false;
      if (planFilter !== "all" && u.planType !== planFilter) return false;
      return true;
    });
  }, [users, query, roleFilter, planFilter]);

  const setRole = async (u: AdminUserRow, isStaff: boolean) => {
    setBusyId(u.id);
    try {
      const res = await patch<{ isStaff: boolean; message: string }>(`/admin/users/${u.id}/role`, { isStaff });
      setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, isStaff: res.isStaff } : x)));
      setToast(res.message);
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
          <h1>Users</h1>
          <p className="page-desc">
            {users.length} account(s) — promote admins, inspect plans, keep the platform healthy.
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          className="admin-input"
          placeholder="Search by name, email or username…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="admin-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">Role: All</option>
          <option value="admin">Role: Admin</option>
          <option value="user">Role: User</option>
        </select>
        <select className="admin-select" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
          <option value="all">Plan: All</option>
          <option value="free">Plan: Free</option>
          <option value="premium">Plan: Premium</option>
        </select>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{filtered.length} shown</span>
      </div>

      <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Plan</th>
              <th>Enrolled</th>
              <th>Reviews</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.4)" }}>
                  No users match.
                </td>
              </tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="h-8 w-8 overflow-hidden rounded-full bg-surface" style={{ width: 32, height: 32 }}>
                      {u.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-accent">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: "#fff" }}>
                        {u.name}
                        {u.id === user?.id && (
                          <span className="admin-badge admin-badge--gray" style={{ marginLeft: 6 }}>
                            YOU
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                        {u.email} · @{u.username}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  {u.isStaff && <span className="admin-badge admin-badge--accent">ADMIN</span>}
                  {!u.isStaff && u.planType === "premium" && (
                    <span className="admin-badge admin-badge--green">PREMIUM</span>
                  )}
                  {!u.isStaff && u.planType !== "premium" && (
                    <span className="admin-badge admin-badge--gray">FREE</span>
                  )}
                </td>
                <td>{u.enrollments}</td>
                <td>{u.reviews}</td>
                <td style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{formatDate(u.createdAt)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {u.id !== user?.id && (
                    <button
                      onClick={() => setRole(u, !u.isStaff)}
                      disabled={busyId === u.id}
                      className={`admin-btn ${u.isStaff ? "admin-btn--danger" : "admin-btn--primary"}`}
                    >
                      {busyId === u.id ? "…" : u.isStaff ? "Demote" : "Make admin"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-fit rounded-full bg-surface-raised px-4 py-2 text-xs text-text shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
