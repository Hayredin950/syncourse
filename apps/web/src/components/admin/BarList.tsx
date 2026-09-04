"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";
import AdminEmpty from "./AdminEmpty";

/**
 * Ranked magnitudes — bars against a shared track, sorted longest first.
 *
 * A ranked list of categories is what a pie chart is usually trying and failing
 * to be: lengths against a common baseline are comparable, angles are not. Every
 * row is labelled and carries its own number, so nothing here depends on colour.
 */
export interface BarItem {
  label: string;
  value: number;
  href?: string;
  /** Secondary text after the label — a share, a subtitle. */
  hint?: string;
}

export default function BarList({
  items,
  format = (v: number) => v.toLocaleString("en-US"),
  /** Denominator for the bar widths. Defaults to the largest value. */
  max,
  /** Shown in place of the bars — phrase it as a title, not a sentence. */
  empty = "Nothing to rank yet",
}: {
  items: BarItem[];
  format?: (v: number) => string;
  max?: number;
  empty?: string;
}) {
  if (items.length === 0) return <AdminEmpty icon={<BarChart3 size={18} />} title={empty} />;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="admin-bars">
      {items.map((it) => (
        <div className="admin-bar-row" key={it.label}>
          <div>
            <div className="admin-bar-row__label" title={it.label}>
              {it.href ? (
                <Link href={it.href} className="admin-cell-link">
                  {it.label}
                </Link>
              ) : (
                it.label
              )}
              {it.hint && <span className="admin-dim"> · {it.hint}</span>}
            </div>
            <div className="admin-bar-row__track">
              <span
                className="admin-bar-row__fill"
                style={{ width: `${top > 0 ? Math.max(1.5, (it.value / top) * 100) : 0}%` }}
              />
            </div>
          </div>
          <div className="admin-bar-row__val">{format(it.value)}</div>
        </div>
      ))}
    </div>
  );
}
