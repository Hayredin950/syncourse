"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { MobileHeader } from "@/components/Nav";
import type { AcceptedLegalDoc, LegalDoc, LegalStatus, PendingLegalDoc } from "@/lib/types";

const TITLES: Record<string, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  refund: "Refund Policy",
};

const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

export default function LegalPage() {
  const { type } = useParams<{ type: string }>();
  const { user, loading: authLoading } = useAuth();
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingLegalDoc | null>(null);
  const [accepted, setAccepted] = useState<AcceptedLegalDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<LegalDoc[]>(`/legal?type=${type}`)
      .then((docs) => setDoc(docs.find((d) => d.type === type) ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type]);

  // Where this reader stands with this document. Only meaningful signed in —
  // the text itself is public.
  const loadStatus = useCallback(() => {
    get<LegalStatus>("/legal/pending")
      .then((res) => {
        setPending(res.pending.find((d) => d.type === type) ?? null);
        setAccepted(res.accepted.find((d) => d.type === type) ?? null);
      })
      .catch(() => {});
  }, [type]);

  useEffect(() => {
    if (authLoading || !user) return;
    loadStatus();
  }, [authLoading, user, loadStatus]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await post<LegalStatus>("/legal/accept", { types: [type], source: "web" });
      // The endpoint answers with the reader's fresh standing, so there is no
      // need to go back for /legal/pending.
      setPending(res.pending.find((d) => d.type === type) ?? null);
      setAccepted(res.accepted.find((d) => d.type === type) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record that — try again.");
    } finally {
      setBusy(false);
    }
  };

  const title = doc?.title || TITLES[type] || "Legal";

  return (
    <main className="page legal">
      <MobileHeader title="Legal" />
      <span className="eyebrow">Syncourse legal</span>
      <h1 className="display" style={{ fontSize: 46 }}>{title}</h1>

      {doc && (
        <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
          Version {doc.version} · effective {stamp(doc.effectiveAt)}
          {doc.updatedAt !== doc.effectiveAt && ` · last edited ${stamp(doc.updatedAt)}`}
        </p>
      )}

      {pending && (
        <div className="dark-panel" style={{ padding: 14, marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {pending.previousVersion
              ? `Updated since you accepted v${pending.previousVersion}`
              : "Not accepted yet"}
          </div>
          {pending.changeSummary && (
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>{pending.changeSummary}</p>
          )}
          {error && (
            <div
              className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
              style={{ marginTop: 10 }}
            >
              {error}
            </div>
          )}
          <button className="btn primary" style={{ marginTop: 12 }} onClick={accept} disabled={busy}>
            {busy ? "Saving…" : `Accept version ${pending.version}`}
          </button>
        </div>
      )}

      {!pending && accepted && (
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          You accepted version {accepted.version} on {stamp(accepted.acceptedAt)}.
        </p>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="whitespace-pre-wrap" style={{ marginTop: 18 }}>
          {doc?.bodyMd || "Document coming soon."}
        </div>
      )}
    </main>
  );
}
