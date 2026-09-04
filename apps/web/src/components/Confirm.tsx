"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";

/**
 * "Are you sure?" for the actions that cannot be undone — the web twin of the
 * app's `Confirm` sheet.
 *
 * Five destructive actions on the public site were guarded by `window.confirm()`:
 * deleting a list from the grid, deleting the list you are reading, deleting a
 * circle, deleting a post, removing a member. That dialog is browser chrome — it
 * carries the origin as a title, it cannot show *which* list you are about to
 * lose in the product's own voice, it blocks the JS thread so nothing can be in
 * flight behind it, and it has no way to report the server refusing. Worst of
 * all it is modal to the whole tab, so a stray Enter confirms a delete.
 *
 * The confirm button is an outline in the destructive colour rather than a filled
 * red slab: filled `hsl(0 70% 56%)` cannot carry 12px type at AA, and the
 * outlined form already exists on the admin side.
 */
export default function Confirm({
  open,
  onClose,
  title,
  body,
  confirmLabel = "Delete",
  pendingLabel = "Deleting…",
  onConfirm,
  destructive = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  /** Replaces `confirmLabel` while the request is in flight. */
  pendingLabel?: string;
  /** Throwing keeps the dialog open and prints the reason inside it. */
  onConfirm: () => void | Promise<void>;
  /** Off for a confirm that isn't a deletion — the button goes amber instead. */
  destructive?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // Reopening on a different row must not inherit the last row's refusal.
  useEffect(() => {
    if (open) setFailed(null);
  }, [open]);

  const go = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await onConfirm();
    } catch (e) {
      setFailed((e as Error)?.message || "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={420}
      footer={
        <div className="sheet-foot__row">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {/* The destructive option takes the wide half: it is what the dialog is
              for, and Cancel is also the ×, the backdrop and the Escape key. */}
          <button
            type="button"
            className={`btn ${destructive ? "danger" : "primary"} btn--grow`}
            onClick={go}
            disabled={busy}
            autoFocus
          >
            {busy ? pendingLabel : confirmLabel}
          </button>
        </div>
      }
    >
      {!!body && <p className="sheet-lead">{body}</p>}
      {!!failed && (
        <p className="sheet-error" role="alert">
          {failed}
        </p>
      )}
    </Modal>
  );
}
