"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";

/**
 * Empty state: an icon, one line that says what would be here, and — where one
 * exists — the action that fills it.
 *
 * The console is young enough that these are seen constantly (six courses, one
 * publisher), so "No sections yet — add them from the edit form" as a bare grey
 * sentence was both the most-viewed copy in the app and the least useful: it
 * named a form it did not link to.
 */
export default function AdminEmpty({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className="admin-blank">
      <span className="admin-blank__icon">{icon ?? <Inbox size={18} />}</span>
      <p className="admin-blank__title">{title}</p>
      {hint && <p className="admin-blank__hint">{hint}</p>}
      {action &&
        (action.href ? (
          <Link href={action.href} className="admin-btn admin-btn--ghost admin-btn--sm">
            {action.label}
          </Link>
        ) : (
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
