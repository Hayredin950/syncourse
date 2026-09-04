"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A card whose head is a disclosure toggle.
 *
 * The forms in this console are long — a course carries a title, a body, a
 * lecturer, a publisher, a category, a cover, a price flag, tags and a section
 * tree — and on a phone that put fifteen fields of metadata between the title
 * and Save. Folding the metadata away puts Save back within a thumb's reach
 * without hiding anything from the desktop layout, where the right-hand rail has
 * the room to show all of it at once.
 *
 * Two details matter:
 *
 *  - `collapseOnPhone` folds *only* below 700px, and only after mount. A static
 *    export ships one HTML file to every width, so deciding the initial state
 *    from the viewport during render would mismatch what the build produced and
 *    React would discard the tree. Rendering open and collapsing in an effect is
 *    the version that hydrates cleanly — and since these sections sit below the
 *    fold, the collapse happens off-screen.
 *  - the body stays mounted when closed (`hidden`), so a half-typed field is not
 *    thrown away by a stray tap on the header, and a form validation error deep
 *    inside a closed fold still submits its value.
 */
export default function AdminFold({
  title,
  hint,
  children,
  collapseOnPhone = false,
  defaultOpen = true,
  flush = false,
}: {
  title: string;
  /** Right-aligned summary — a count, or which of the fields inside are set. */
  hint?: string;
  children: React.ReactNode;
  collapseOnPhone?: boolean;
  defaultOpen?: boolean;
  /** For a fold of list rows, whose dividers have to reach the card edge. */
  flush?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  useEffect(() => {
    if (!collapseOnPhone) return;
    if (window.matchMedia("(max-width: 700px)").matches) setOpen(false);
  }, [collapseOnPhone]);

  return (
    <section className={`admin-card admin-fold ${flush ? "admin-fold--flush" : ""}`} data-open={open}>
      <button
        type="button"
        className="admin-fold__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <ChevronDown size={14} className="admin-fold__chev" />
        <span>{title}</span>
        {hint && <span className="admin-fold__hint">{hint}</span>}
      </button>
      <div className="admin-fold__body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
