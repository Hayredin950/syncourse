"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";

/**
 * Card frame for one chart, with the table behind it.
 *
 * Every chart on the analytics page can be switched to the numbers it was drawn
 * from. That is the accessibility floor — a shape read at a glance is not a
 * substitute for the value — and it doubles as the answer to "what exactly was
 * that column".
 */
export default function ChartCard({
  title,
  hint,
  note,
  columns,
  rows,
  children,
}: {
  title: string;
  hint?: string;
  /** Caveat printed under the chart — where the numbers come from, what they miss. */
  note?: string;
  columns: string[];
  rows: (string | number)[][];
  children: React.ReactNode;
}) {
  const [table, setTable] = useState(false);

  return (
    <div className="admin-card admin-card--flush">
      <div className="admin-card__head">
        <h3>{title}</h3>
        <div className="admin-inline">
          {hint && <span className="admin-section-head__hint">{hint}</span>}
          <div className="admin-seg" role="group" aria-label={`${title} view`}>
            <button type="button" aria-pressed={!table} aria-label="Chart" title="Chart" onClick={() => setTable(false)}>
              <BarChart3 size={12} />
            </button>
            <button type="button" aria-pressed={table} aria-label="Table" title="Table" onClick={() => setTable(true)}>
              <Table2 size={12} />
            </button>
          </div>
        </div>
      </div>

      {table ? (
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c} className={i === 0 ? undefined : "admin-table__num"}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((cell, ci) => (
                  <td key={ci} className={ci === 0 ? "admin-cell-title" : "admin-table__num"}>
                    {typeof cell === "number" ? cell.toLocaleString("en-US") : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: "14px 16px 16px" }}>{children}</div>
      )}

      {note && !table && (
        <p className="admin-section-head__hint" style={{ padding: "0 16px 14px" }}>
          {note}
        </p>
      )}
    </div>
  );
}
