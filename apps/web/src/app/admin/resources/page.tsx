"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Pencil, Plus, Search } from "lucide-react";
import { del, get } from "@/lib/api";
import type { AdminResourceRow } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useAdminToast } from "@/components/admin/AdminToast";
import AdminEmpty from "@/components/admin/AdminEmpty";
import ConfirmButton from "@/components/admin/ConfirmButton";
import Pagination, { clampPage } from "@/components/admin/Pagination";

const TYPE_LABELS: Record<string, string> = {
  "cheat-sheet": "Cheat-sheet",
  roadmap: "Roadmap",
  note: "Useful note",
};

type Sort = "updated" | "views" | "title";

/**
 * The short-form half of the catalogue. Kept out of Courses because these have
 * no curriculum: a cheat-sheet is one post — a body of markdown plus whatever
 * files came with it.
 */
export default function AdminResourcesPage() {
  const toast = useAdminToast();
  const [rows, setRows] = useState<AdminResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("live");
  const [sort, setSort] = useState<Sort>("updated");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    get<AdminResourceRow[]>("/admin/resources")
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load resources"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const live = rows.filter((r) => !r.deletedAt);
    return {
      total: live.length,
      "cheat-sheet": live.filter((r) => r.type === "cheat-sheet").length,
      roadmap: live.filter((r) => r.type === "roadmap").length,
      note: live.filter((r) => r.type === "note").length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (q && !`${r.title} ${r.categoryName ?? ""} ${r.tags.join(" ")}`.toLowerCase().includes(q)) return false;
      if (scope === "live" && r.deletedAt) return false;
      if (scope === "deleted" && !r.deletedAt) return false;
      if (["cheat-sheet", "roadmap", "note"].includes(scope) && (r.type !== scope || r.deletedAt)) return false;
      return true;
    });
    const sorted = [...list];
    if (sort === "views") sorted.sort((a, b) => b.viewCount - a.viewCount);
    else if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else sorted.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    return sorted;
  }, [rows, query, scope, sort]);

  const safePage = clampPage(page, filtered.length, perPage);
  const visible = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const toggleDelete = async (r: AdminResourceRow) => {
    setBusy(r.slug);
    try {
      const res = await del<{ deleted: boolean }>(`/admin/resources/${r.slug}`);
      setRows((prev) =>
        prev.map((x) => (x.slug === r.slug ? { ...x, deletedAt: res.deleted ? new Date().toISOString() : null } : x)),
      );
      toast.success(res.deleted ? `“${r.title}” hidden from the site` : `“${r.title}” restored`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change that resource");
    } finally {
      setBusy(null);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setScope("live");
    setPage(1);
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Resources</h1>
          <p className="page-desc">
            Cheat-sheets, roadmaps and useful notes — {counts.total.toLocaleString("en-US")} published. Each one is a
            single post: a body of markdown plus the files that came with it, shown in full on the site.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <Link href="/admin/resources/new" className="admin-btn admin-btn--primary">
            <Plus size={13} /> New resource
          </Link>
        </div>
      </div>

      <div className="admin-toolbar">
        <span className="admin-search">
          <Search size={14} />
          <input
            className="admin-input"
            placeholder="Title, category or tag…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            aria-label="Search resources"
          />
        </span>
        <div className="admin-seg" role="group" aria-label="Filter resources">
          {(
            [
              ["live", `All ${counts.total}`],
              ["cheat-sheet", `Cheat-sheets ${counts["cheat-sheet"]}`],
              ["roadmap", `Roadmaps ${counts.roadmap}`],
              ["note", `Notes ${counts.note}`],
              ["deleted", "Hidden"],
            ] as const
          ).map(([val, label]) => (
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
        <select
          className="admin-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort resources"
        >
          <option value="updated">Recently updated</option>
          <option value="views">Most viewed</option>
          <option value="title">Title A–Z</option>
        </select>
        <span className="admin-toolbar__count">
          {filtered.length === rows.length ? `${rows.length} total` : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      <div className="admin-card admin-card--flush">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 46 }} />
              <th>Resource</th>
              <th>Type</th>
              <th className="admin-table__num">Files</th>
              <th className="admin-table__num">Views</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`s${i}`}>
                  <td colSpan={7}>
                    <span className="admin-skeleton" style={{ display: "block", height: 26 }} />
                  </td>
                </tr>
              ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={7}>
                  {rows.length === 0 ? (
                    <AdminEmpty
                      icon={<FileText size={18} />}
                      title="Nothing here yet"
                      hint="A cheat-sheet, roadmap or note published here appears at /resources straight away."
                      action={{ label: "New resource", href: "/admin/resources/new" }}
                    />
                  ) : (
                    <AdminEmpty
                      icon={<Search size={18} />}
                      title="Nothing matches those filters"
                      hint="Try a different title, or widen the scope to All."
                      action={{ label: "Clear filters", onClick: clearFilters }}
                    />
                  )}
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.id}>
                <td data-role="media">
                  <span className="admin-thumb" style={{ display: "block" }}>
                    {r.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.coverUrl} alt="" />
                    ) : (
                      <FileText size={14} style={{ opacity: 0.4 }} />
                    )}
                  </span>
                </td>
                <td data-role="head" style={{ maxWidth: 360 }}>
                  <Link href={`/admin/resources/edit?slug=${r.slug}`} className="admin-cell-link">
                    <span className={`admin-cell-title ${r.deletedAt ? "admin-strike" : ""}`}>{r.title}</span>
                    <span className="admin-cell-sub" style={{ display: "block" }}>
                      {r.categoryIcon ? `${r.categoryIcon} ` : ""}
                      {r.categoryName ?? "No category"}
                      {r.organizationName ? ` · ${r.organizationName}` : ""}
                    </span>
                  </Link>
                </td>
                <td data-role="wide">
                  <span className="admin-inline" style={{ gap: 4 }}>
                    <span className="admin-badge admin-badge--gray">{TYPE_LABELS[r.type] ?? r.type}</span>
                    {r.isFeatured && <span className="admin-badge admin-badge--blue">Featured</span>}
                    {r.isEmpty && <span className="admin-badge admin-badge--red">Empty</span>}
                    {r.deletedAt && <span className="admin-badge admin-badge--red">Hidden</span>}
                  </span>
                </td>
                <td className="admin-table__num" data-label="Files">
                  {r.mediaCount}
                </td>
                <td className="admin-table__num" data-label="Views">
                  {r.viewCount.toLocaleString("en-US")}
                </td>
                <td className="admin-table__quiet" data-label="Updated">
                  {formatDate(r.updatedAt)}
                </td>
                <td className="admin-table__actions">
                  <a
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                    href={`/resources/${r.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View
                  </a>
                  <Link href={`/admin/resources/edit?slug=${r.slug}`} className="admin-btn admin-btn--ghost admin-btn--sm">
                    <Pencil size={12} /> Edit
                  </Link>
                  {r.deletedAt ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      disabled={busy === r.slug}
                      onClick={() => toggleDelete(r)}
                    >
                      Restore
                    </button>
                  ) : (
                    <ConfirmButton
                      label="Hide"
                      question="Hide from the site?"
                      confirmLabel="Yes, hide"
                      busy={busy === r.slug}
                      icon={false}
                      className="admin-btn admin-btn--danger admin-btn--sm"
                      onConfirm={() => toggleDelete(r)}
                    />
                  )}
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
          onPerPage={(n) => {
            setPerPage(n);
            setPage(1);
          }}
          noun="resources"
        />
      </div>
    </div>
  );
}
