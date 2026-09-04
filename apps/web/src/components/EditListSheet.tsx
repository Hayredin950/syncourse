"use client";

import { useState } from "react";
import { Lock, Users } from "lucide-react";
import Modal from "./Modal";
import { patch } from "@/lib/api";
import type { CollectionDetail } from "@/lib/types";

/**
 * Rename a collection, reword it, or flip who can see it.
 *
 * Shared by the collections index and the collection page, because both places
 * legitimately own a list: the index is where you find one you made months ago,
 * the detail page is where you are while filling it. `list` is deliberately the
 * narrow shape both pages have — the API answers with the full detail either way.
 */
export function EditListSheet({
  list,
  onClose,
  onSaved,
  onError,
}: {
  list: { id: string; name: string; description: string | null; visibility: "public" | "private" };
  onClose: () => void;
  onSaved: (next: CollectionDetail) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">(list.visibility);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      onSaved(await patch<CollectionDetail>(`/lists/${list.id}`, { name, description, visibility }));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit list"
      width={420}
      footer={
        <div className="sheet-foot__row">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary btn--grow" disabled={!name.trim() || busy} onClick={submit}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      }
    >
      <label className="field-label" htmlFor="list-name">Name</label>
      <input id="list-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="field-label" htmlFor="list-desc">Description</label>
      <textarea id="list-desc" className="form-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="pills" style={{ margin: "14px 0 4px" }}>
        <button type="button" className={`badge ${visibility === "private" ? "primary" : ""}`} onClick={() => setVisibility("private")} aria-pressed={visibility === "private"}>
          <Lock size={11} /> Private
        </button>
        <button type="button" className={`badge ${visibility === "public" ? "primary" : ""}`} onClick={() => setVisibility("public")} aria-pressed={visibility === "public"}>
          <Users size={11} /> Public
        </button>
      </div>
      <p className="muted" style={{ fontSize: 11 }}>
        {visibility === "private" ? "Only you can open this list." : "Anyone with the link can open this list."}
      </p>
    </Modal>
  );
}
