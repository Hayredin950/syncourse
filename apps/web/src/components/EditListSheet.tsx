"use client";

import { useState } from "react";
import { Lock, Users, X } from "lucide-react";
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
    <div className="sheet" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="section-head" style={{ margin: 0 }}>
          <h2 style={{ fontSize: 16 }}>Edit list</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <label className="muted" style={{ fontSize: 11, display: "block", margin: "14px 0 6px" }}>NAME</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="muted" style={{ fontSize: 11, display: "block", margin: "14px 0 6px" }}>DESCRIPTION</label>
        <textarea className="form-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="pills" style={{ margin: "14px 0 4px" }}>
          <button className={`badge ${visibility === "private" ? "primary" : ""}`} onClick={() => setVisibility("private")}>
            <Lock size={11} style={{ display: "inline", verticalAlign: "middle" }} /> Private
          </button>
          <button className={`badge ${visibility === "public" ? "primary" : ""}`} onClick={() => setVisibility("public")}>
            <Users size={11} style={{ display: "inline", verticalAlign: "middle" }} /> Public
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11 }}>
          {visibility === "private" ? "Only you can open this list." : "Anyone with the link can open this list."}
        </p>
        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!name.trim() || busy} onClick={submit}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
