"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * List pager.
 *
 * The admin list endpoints return everything in one shot, so this pages the
 * array client-side — which is the right trade at this size and keeps search and
 * filters instant. `total` is the count *after* filtering, so the readout
 * ("1–25 of 87") always describes what the user is actually looking at.
 */
export default function Pagination({
  page,
  perPage,
  total,
  onPage,
  onPerPage,
  noun = "rows",
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (p: number) => void;
  onPerPage?: (n: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);

  return (
    <div className="admin-pager">
      <span className="admin-pager__info">
        {total === 0 ? `No ${noun}` : `${from}–${to} of ${total.toLocaleString("en-US")} ${noun}`}
      </span>
      <div className="admin-pager__ctrls">
        {onPerPage && (
          <select
            className="admin-select"
            style={{ padding: "4px 8px", fontSize: 11 }}
            value={perPage}
            onChange={(e) => {
              onPerPage(Number(e.target.value));
              onPage(1);
            }}
            aria-label={`${noun} per page`}
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="admin-btn admin-btn--ghost admin-btn--icon"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="admin-pager__page">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="admin-btn admin-btn--ghost admin-btn--icon"
          onClick={() => onPage(Math.min(pages, page + 1))}
          disabled={page >= pages}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

/** Clamp a page number after a filter change shrinks the result set. */
export function clampPage(page: number, total: number, perPage: number): number {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / perPage)));
}
