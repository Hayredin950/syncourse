"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * The one dialog in the app.
 *
 * Eleven sheets each hand-rolled the same three lines — a `.sheet` backdrop with
 * `onClick={onClose}`, a panel with `onClick={(e) => e.stopPropagation()}`, and a
 * close button — and between them they got the hard parts wrong in eleven
 * different ways. Only `LegalConsent` announced itself as a dialog; none of them
 * closed on Escape, so the sole way out of a filter sheet on a keyboard was to
 * Tab to the × and press Enter. Tab did not stop at the panel edge either: it
 * walked out the back of the dialog into the page beneath, which is still
 * scrollable behind the scrim, so a screen-reader user could read a page they
 * could not see and click links they could not reach with a mouse.
 *
 * What this owns, so no call site has to think about it again:
 *   - `role="dialog" aria-modal` tied to the heading it actually renders
 *   - Escape closes; the backdrop closes; a click inside never does
 *   - focus moves in on open and returns to whatever opened it on close
 *   - Tab and Shift-Tab cycle inside the panel
 *   - the page behind stops scrolling, without the layout shifting sideways as
 *     the scrollbar goes
 *
 * Rendered through a portal on `document.body`: several of these open from
 * inside a sheet that is already open (a course picker over a circle's wall),
 * and a fixed panel nested in a scrolling ancestor is at that ancestor's mercy.
 */

/** Depth of currently-open dialogs, so the innermost one to close doesn't unlock the page. */
let openCount = 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  width,
  children,
  footer,
  className = "",
  bodyClassName = "",
  /** Skips the built-in header. The caller must then pass `label`. */
  bare = false,
  label,
  /** The dialog is the whole point of the screen — no × and no backdrop dismiss. */
  locked = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  bare?: boolean;
  label?: string;
  locked?: boolean;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const headingId = useRef(`dlg-${Math.random().toString(36).slice(2, 9)}`).current;

  // Static export prerenders this file, so the portal target only exists later.
  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    if (!locked) onClose();
  }, [locked, onClose]);

  // Hold the page still. Padding replaces the scrollbar's width so the layout
  // behind the scrim doesn't jump 15px to the right as the dialog opens.
  useLayoutEffect(() => {
    if (!open) return;
    const body = document.body;
    if (openCount === 0) {
      const gap = window.innerWidth - document.documentElement.clientWidth;
      body.dataset.prevOverflow = body.style.overflow;
      body.dataset.prevPadRight = body.style.paddingRight;
      body.style.overflow = "hidden";
      if (gap > 0) body.style.paddingRight = `${gap}px`;
    }
    openCount += 1;
    return () => {
      openCount -= 1;
      if (openCount === 0) {
        body.style.overflow = body.dataset.prevOverflow ?? "";
        body.style.paddingRight = body.dataset.prevPadRight ?? "";
        delete body.dataset.prevOverflow;
        delete body.dataset.prevPadRight;
      }
    };
  }, [open]);

  // Move focus in, and put it back where it came from on the way out.
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const node = panel.current;
    // An `autoFocus` input inside the body has already claimed focus and knows
    // better than we do; don't fight it.
    if (node && !node.contains(document.activeElement)) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus();
    }
    return () => {
      const back = restoreTo.current;
      // Only if it's still in the document — the row that opened the dialog is
      // often the row the dialog deleted.
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  // Escape out, and keep Tab inside the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const node = panel.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    // Capture, so the innermost open dialog answers Escape first.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="sheet"
      onMouseDown={(e) => {
        // mousedown, not click: a click that *starts* on the panel and ends on
        // the backdrop (selecting text, dragging a slider past the edge) used to
        // close the dialog and throw the form away.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        className={`sheet-panel ${className}`.trim()}
        style={width ? { maxWidth: width } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title && !bare ? headingId : undefined}
        aria-label={bare || !title ? label : undefined}
        tabIndex={-1}
      >
        {!bare && title && (
          <div className="sheet-head">
            <div className="sheet-head__text">
              <h2 id={headingId}>{title}</h2>
              {!!subtitle && <p className="sheet-head__sub">{subtitle}</p>}
            </div>
            {!locked && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label={`Close ${title}`}>
                <X size={15} />
              </button>
            )}
          </div>
        )}
        <div className={`sheet-body ${bodyClassName}`.trim()}>{children}</div>
        {!!footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
