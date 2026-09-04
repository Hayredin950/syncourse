"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Lock, Plus, Users } from "lucide-react";
import Modal from "./Modal";
import { ApiError, del, get, post } from "@/lib/api";
import { plural } from "@/lib/format";
import type { CollectionMembership } from "@/lib/types";
import { SkList } from "@/components/Skeleton";

/**
 * "Add to list" from anywhere a course is shown. It asks the API which of your
 * lists already hold the course, so a tick means the course is in that list —
 * tapping toggles it rather than blindly re-posting an item that is already there.
 *
 * The sheet also creates a list inline: being sent to /lists to make one and then
 * navigating back to the course was the reason nobody ever filled a list.
 */
export function AddToListSheet({
  courseId,
  courseTitle,
  onClose,
  onFlash,
}: {
  courseId: string;
  courseTitle: string;
  onClose: () => void;
  onFlash: (message: string) => void;
}) {
  const [lists, setLists] = useState<CollectionMembership[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    get<CollectionMembership[]>(`/me/lists/for-course?courseId=${encodeURIComponent(courseId)}`)
      .then((rows) => {
        setLists(rows);
        setError(null);
      })
      .catch((e) => {
        setLists([]);
        // A signed-out visitor gets a 401 here; "Unauthorized" tells them nothing
        // about what to do next, so say it the way the mobile sheet does.
        setError(
          e instanceof ApiError && e.status === 401
            ? "Sign in to keep lists of your own."
            : e?.message || "Could not load your lists.",
        );
      });
  }, [courseId]);

  useEffect(load, [load]);

  const toggle = async (list: CollectionMembership) => {
    setBusy(list.id);
    try {
      if (list.contains) {
        await del(`/lists/${list.id}/items/${courseId}`);
        onFlash(`Removed from ${list.name}`);
      } else {
        await post(`/lists/${list.id}/items`, { courseId });
        onFlash(`Added to ${list.name}`);
      }
      // Local flip keeps the tick honest without a second round trip.
      setLists((prev) =>
        (prev ?? []).map((l) =>
          l.id === list.id
            ? { ...l, contains: !l.contains, itemCount: l.itemCount + (l.contains ? -1 : 1) }
            : l,
        ),
      );
    } catch (e) {
      onFlash((e as Error).message ?? "Could not update that list");
    } finally {
      setBusy(null);
    }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy("new");
    try {
      const list = await post<{ id: string; name: string }>("/lists", { name, visibility: "private" });
      await post(`/lists/${list.id}/items`, { courseId });
      setNewName("");
      setCreating(false);
      onFlash(`Added to ${list.name}`);
      load();
    } catch (e) {
      onFlash((e as Error).message ?? "Could not create that list");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add to list"
      subtitle={courseTitle}
      width={420}
      /* Nothing loaded, nothing to create into — a new list would fail the same way. */
      footer={
        error ? undefined : creating ? (
          <div>
            <input
              className="form-input"
              autoFocus
              placeholder="New list name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
            />
            <div className="sheet-foot__row" style={{ marginTop: 10 }}>
              <button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button>
              <button type="button" className="btn primary btn--grow" disabled={!newName.trim() || busy === "new"} onClick={createAndAdd}>
                {busy === "new" ? "Creating…" : "Create & add"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn" style={{ width: "100%" }} onClick={() => setCreating(true)}>
            <Plus size={13} /> New list
          </button>
        )
      }
    >
      {lists === null ? (
        <SkList n={3} label="Loading your collections" />
      ) : lists.length === 0 ? (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          {error ?? "You have no lists yet. Name one below and this course goes straight into it."}
        </p>
      ) : (
        /* No inner scroller: the dialog's own body scrolls now, and a 280px box
           inside it meant two nested scroll areas fighting over one wheel. */
        <div className="dark-panel dark-panel--pad-xs">
          {lists.map((l) => (
            <button
              key={l.id}
              className="lesson"
              style={{ width: "100%", textAlign: "left" }}
              onClick={() => toggle(l)}
              disabled={busy === l.id}
              aria-pressed={l.contains}
            >
              <span
                className={l.contains ? "icon-badge icon-badge--amber" : "icon-badge icon-badge--gray"}
                style={{ width: 26, height: 26 }}
              >
                {busy === l.id ? <Loader2 size={12} className="animate-spin" /> : l.contains ? <Check size={12} /> : <Plus size={12} />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: 12 }}>{l.name}</strong>
                <small className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {l.visibility === "public" ? <Users size={9} /> : <Lock size={9} />}
                  {plural(l.itemCount, "course")}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
