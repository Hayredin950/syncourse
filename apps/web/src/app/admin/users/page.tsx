"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Copy, Search, ShieldCheck, ShieldOff, X } from "lucide-react";
import { get, patch } from "@/lib/api";
import type { AdminUserRow } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useAdminToast } from "@/components/admin/AdminToast";
import Pagination, { clampPage } from "@/components/admin/Pagination";

export default function AdminUsers() {
  const { user } = useAuth();
  const toast = useAdminToast();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    get<AdminUserRow[]>("/admin/users")
      .then(setUsers)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    // toast is stable (memoised in the provider) but excluded to keep this a
    // mount-only fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // A filter that shrinks the list must not leave you stranded on page 7 of 3.
  const safePage = clampPage(page, filtered.length, perPage);
  const visible = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const selectableOnPage = visible.filter((u) => u.id !== user?.id);
  const allOnPageSelected = selectableOnPage.length > 0 && selectableOnPage.every((u) => selected.has(u.id));
  const someOnPageSelected = selectableOnPage.some((u) => selected.has(u.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) selectableOnPage.forEach((u) => next.delete(u.id));
      else selectableOnPage.forEach((u) => next.add(u.id));
      return next;
    });

  const setRole = async (u: AdminUserRow, isStaff: boolean) => {
    setBusyId(u.id);
    try {
      const res = await patch<{ isStaff: boolean; message: string }>(`/admin/users/${u.id}/role`, { isStaff });
      setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, isStaff: res.isStaff } : x)));
      toast.success(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change that role");
    } finally {
      setBusyId(null);
    }
  };

  /** Bulk role change. One request per row — the API has no batch endpoint, and
   *  reporting partial success honestly beats pretending it was atomic. */
  const bulkRole = async (isStaff: boolean) => {
    const ids = [...selected].filter((id) => id !== user?.id);
    if (!ids.length) return;
    setBulkBusy(true);
    let ok = 0;
    for (const id of ids) {
      try {
        const res = await patch<{ isStaff: boolean }>(`/admin/users/${id}/role`, { isStaff });
        setUsers((p) => p.map((x) => (x.id === id ? { ...x, isStaff: res.isStaff } : x)));
        ok += 1;
      } catch {
        /* counted below */
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (ok === ids.length) toast.success(`${ok} account${ok === 1 ? "" : "s"} ${isStaff ? "promoted" : "demoted"}`);
    else toast.error(`${ok} of ${ids.length} updated — the rest failed`);
  };

  const copyEmails = async () => {
    const list = users.filter((u) => selected.has(u.id)).map((u) => u.email);
    try {
      await navigator.clipboard.writeText(list.join(", "));
      toast.success(`${list.length} email${list.length === 1 ? "" : "s"} copied`);
    } catch {
      toast.error("The browser blocked clipboard access");
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Users</h1>
          <p className="page-desc">
            {users.length.toLocaleString("en-US")} accounts. Promote staff, inspect plans, and open any account for its
            full history.
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <span className="admin-search">
          <Search size={14} />
          <input
            className="admin-input"
            placeholder="Name, email or username…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            aria-label="Search users"
          />
        </span>
        <div className="admin-seg" role="group" aria-label="Filter by role">
          {[
            ["all", "All"],
            ["admin", "Staff"],
            ["user", "Members"],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              aria-pressed={roleFilter === val}
              onClick={() => {
                setRoleFilter(val);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className="admin-select"
          value={planFilter}
          onChange={(e) => {
            setPlanFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by plan"
        >
          <option value="all">Any plan</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
        </select>
        <span className="admin-toolbar__count">
          {filtered.length === users.length ? `${users.length} total` : `${filtered.length} of ${users.length}`}
        </span>
      </div>

      <div className="admin-card admin-card--flush">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  className="admin-check"
                  checked={allOnPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                  }}
                  onChange={togglePage}
                  aria-label="Select all users on this page"
                />
              </th>
              <th>User</th>
              <th>Access</th>
              <th className="admin-table__num">Downloads</th>
              <th className="admin-table__num">Reviews</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`s${i}`}>
                  <td colSpan={7}>
                    <span className="admin-skeleton" style={{ display: "block", height: 20 }} />
                  </td>
                </tr>
              ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <p className="admin-empty">No account matches those filters.</p>
                </td>
              </tr>
            )}
            {visible.map((u) => (
              <tr key={u.id} data-selected={selected.has(u.id)}>
                <td>
                  {u.id !== user?.id && (
                    <input
                      type="checkbox"
                      className="admin-check"
                      checked={selected.has(u.id)}
                      onChange={() => toggle(u.id)}
                      aria-label={`Select ${u.name}`}
                    />
                  )}
                </td>
                <td>
                  <Link href={`/admin/users/detail?id=${u.id}`} className="admin-inline admin-cell-link" style={{ gap: 10 }}>
                    <span className="admin-avatar">
                      {u.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatarUrl} alt="" />
                      ) : (
                        u.name.charAt(0).toUpperCase()
                      )}
                    </span>
                    <span>
                      <span className="admin-cell-title admin-inline" style={{ gap: 6 }}>
                        {u.name}
                        {u.id === user?.id && <span className="admin-badge admin-badge--gray">You</span>}
                        {!u.isVerified && <span className="admin-badge admin-badge--gray">Unverified</span>}
                      </span>
                      <span className="admin-cell-sub" style={{ display: "block" }}>
                        {u.email} · @{u.username}
                      </span>
                    </span>
                  </Link>
                </td>
                <td>
                  {u.isStaff ? (
                    <span className="admin-badge admin-badge--accent">Staff</span>
                  ) : u.planType === "premium" ? (
                    <span className="admin-badge admin-badge--green">Premium</span>
                  ) : (
                    <span className="admin-badge admin-badge--gray">Free</span>
                  )}
                </td>
                <td className="admin-table__num">{u.downloads}</td>
                <td className="admin-table__num">{u.reviews}</td>
                <td className="admin-table__quiet">{formatDate(u.createdAt)}</td>
                <td className="admin-table__actions">
                  {u.id !== user?.id && (
                    <button
                      type="button"
                      onClick={() => setRole(u, !u.isStaff)}
                      disabled={busyId === u.id}
                      className={`admin-btn admin-btn--sm ${u.isStaff ? "admin-btn--danger" : "admin-btn--ghost"}`}
                    >
                      {busyId === u.id ? "…" : u.isStaff ? "Revoke staff" : "Make staff"}
                    </button>
                  )}
                  <Link
                    href={`/admin/users/detail?id=${u.id}`}
                    className="admin-btn admin-btn--quiet admin-btn--icon"
                    aria-label={`Open ${u.name}`}
                    style={{ marginLeft: 4 }}
                  >
                    <ChevronRight size={14} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={safePage}
          perPage={perPage}
          total={filtered.length}
          onPage={setPage}
          onPerPage={setPerPage}
          noun="accounts"
        />
      </div>

      {selected.size > 0 && (
        <div className="admin-bulkbar">
          <span className="admin-bulkbar__count">{selected.size} selected</span>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={copyEmails}>
            <Copy size={13} /> Copy emails
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-btn--sm"
            disabled={bulkBusy}
            onClick={() => bulkRole(true)}
          >
            <ShieldCheck size={13} /> Make staff
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--danger admin-btn--sm"
            disabled={bulkBusy}
            onClick={() => bulkRole(false)}
          >
            <ShieldOff size={13} /> Revoke staff
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--quiet admin-btn--icon"
            onClick={() => setSelected(new Set())}
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
