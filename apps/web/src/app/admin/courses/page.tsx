"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Pencil, Plus, Search } from "lucide-react";
import { del, get } from "@/lib/api";
import type { AdminCourseRow } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useAdminToast } from "@/components/admin/AdminToast";
import ConfirmButton from "@/components/admin/ConfirmButton";
import Pagination, { clampPage } from "@/components/admin/Pagination";

type Sort = "updated" | "downloads" | "rating" | "title";

export default function AdminCourses() {
  const toast = useAdminToast();
  const [courses, setCourses] = useState<AdminCourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("live");
  const [sort, setSort] = useState<Sort>("updated");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  useEffect(() => {
    get<AdminCourseRow[]>("/admin/courses")
      .then(setCourses)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = courses.filter((c) => {
      if (q && !`${c.title} ${c.lecturer ?? ""} ${c.organization ?? ""}`.toLowerCase().includes(q)) return false;
      if (scope === "live" && c.deleted) return false;
      if (scope === "premium" && !c.isPremium) return false;
      if (scope === "deleted" && !c.deleted) return false;
      return true;
    });
    const sorted = [...rows];
    if (sort === "downloads") sorted.sort((a, b) => b.downloadCount - a.downloadCount);
    else if (sort === "rating") sorted.sort((a, b) => b.ratingAvg - a.ratingAvg);
    else if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else sorted.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    return sorted;
  }, [courses, query, scope, sort]);

  const safePage = clampPage(page, filtered.length, perPage);
  const visible = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const remove = async (c: AdminCourseRow) => {
    setBusySlug(c.slug);
    try {
      await del(`/admin/courses/${c.slug}`);
      // Soft delete on the API side, so mark the row rather than dropping it —
      // the "Deleted" scope has to still be able to find it.
      setCourses((p) => p.map((x) => (x.slug === c.slug ? { ...x, deleted: true } : x)));
      toast.success(`“${c.title}” deleted — student progress is kept`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that course");
    } finally {
      setBusySlug(null);
    }
  };

  return (
    <div>
      <div className="admin-page-head">
        <div>
          <h1>Courses</h1>
          <p className="page-desc">
            {courses.length.toLocaleString("en-US")} in the catalogue. Everything visible on the site comes from here.
          </p>
        </div>
        <div className="admin-page-head__actions">
          <Link href="/admin/courses/new" className="admin-btn admin-btn--primary">
            <Plus size={13} /> New course
          </Link>
        </div>
      </div>

      <div className="admin-toolbar">
        <span className="admin-search">
          <Search size={14} />
          <input
            className="admin-input"
            placeholder="Title, lecturer or publisher…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            aria-label="Search courses"
          />
        </span>
        <div className="admin-seg" role="group" aria-label="Filter courses">
          {[
            ["live", "Live"],
            ["premium", "Premium"],
            ["deleted", "Deleted"],
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
        <select
          className="admin-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort courses"
        >
          <option value="updated">Recently updated</option>
          <option value="downloads">Most downloads</option>
          <option value="rating">Highest rated</option>
          <option value="title">Title A–Z</option>
        </select>
        <span className="admin-toolbar__count">
          {filtered.length === courses.length ? `${courses.length} total` : `${filtered.length} of ${courses.length}`}
        </span>
      </div>

      <div className="admin-card admin-card--flush">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 46 }} />
              <th>Course</th>
              <th>Type</th>
              <th className="admin-table__num">Sections</th>
              <th className="admin-table__num">Files</th>
              <th className="admin-table__num">Rating</th>
              <th className="admin-table__num">Downloads</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`s${i}`}>
                  <td colSpan={9}>
                    <span className="admin-skeleton" style={{ display: "block", height: 26 }} />
                  </td>
                </tr>
              ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <p className="admin-empty">
                    {courses.length === 0 ? "No courses yet — create your first one." : "Nothing matches those filters."}
                  </p>
                </td>
              </tr>
            )}
            {visible.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="admin-thumb" style={{ display: "block" }}>
                    {c.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbnailUrl} alt="" />
                    ) : null}
                  </span>
                </td>
                <td style={{ maxWidth: 340 }}>
                  <Link href={`/admin/courses/detail?slug=${c.slug}`} className="admin-cell-link">
                    <span className={`admin-cell-title ${c.deleted ? "admin-strike" : ""}`}>{c.title}</span>
                    <span className="admin-cell-sub" style={{ display: "block" }}>
                      {c.lecturer ?? "No lecturer"} · {c.organization ?? "No publisher"}
                    </span>
                  </Link>
                </td>
                <td>
                  <span className="admin-inline" style={{ gap: 4 }}>
                    <span className="admin-badge admin-badge--gray">{c.contentType}</span>
                    {c.isPremium && <span className="admin-badge admin-badge--accent">Premium</span>}
                    {c.deleted && <span className="admin-badge admin-badge--red">Deleted</span>}
                  </span>
                </td>
                <td className="admin-table__num">{c.sectionCount}</td>
                <td className="admin-table__num">{c.fileCount}</td>
                <td className="admin-table__num">{c.ratingAvg > 0 ? c.ratingAvg.toFixed(1) : "—"}</td>
                <td className="admin-table__num">{c.downloadCount.toLocaleString("en-US")}</td>
                <td className="admin-table__quiet">{formatDate(c.updatedAt)}</td>
                <td className="admin-table__actions">
                  <Link
                    href={`/admin/courses/${c.slug}/edit`}
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                  >
                    <Pencil size={12} /> Edit
                  </Link>
                  {!c.deleted && (
                    <ConfirmButton
                      label="Delete"
                      question="Delete?"
                      confirmLabel="Yes, delete"
                      busy={busySlug === c.slug}
                      icon={false}
                      className="admin-btn admin-btn--danger admin-btn--sm"
                      onConfirm={() => remove(c)}
                    />
                  )}
                  <Link
                    href={`/admin/courses/detail?slug=${c.slug}`}
                    className="admin-btn admin-btn--quiet admin-btn--icon"
                    aria-label={`Open ${c.title}`}
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
          noun="courses"
        />
      </div>
    </div>
  );
}
