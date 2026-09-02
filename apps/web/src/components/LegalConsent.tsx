"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { LegalStatus, PendingLegalDoc } from "@/lib/types";

const SNOOZE_KEY = "syncourse_legal_snooze";

/** "Terms of Service and Privacy Policy" rather than a bare comma list. */
const joinTitles = (docs: PendingLegalDoc[]) =>
  docs
    .map((d) => d.title)
    .reduce((acc, t, i) => (i === 0 ? t : i === docs.length - 1 ? `${acc} and ${t}` : `${acc}, ${t}`), "");

/**
 * Asks a signed-in user to accept legal documents they have not agreed to in
 * their current version — which is how an admin edit reaches people who already
 * accepted the old wording (the API also sends them a notification).
 *
 * Deliberately not a hard block. Consent that is extracted by locking someone
 * out of the app they already paid for is worth less than consent given freely,
 * and a network hiccup on /legal/pending must never be able to brick the site.
 * "Later" hides it until the next visit; the notification and this prompt both
 * come back until the acceptance is recorded.
 */
export default function LegalConsent() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [pending, setPending] = useState<PendingLegalDoc[]>([]);
  const [snoozed, setSnoozed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The admin console is its own shell, and /auth is mid-sign-in — neither is a
  // place to interrupt with a consent sheet.
  const muted = !!pathname && (pathname.startsWith("/admin") || pathname.startsWith("/auth"));

  useEffect(() => {
    if (loading || !user || muted) return;
    let live = true;
    get<LegalStatus>("/legal/pending")
      .then((res) => {
        if (!live) return;
        setPending(res.pending);
        const key = res.pending.map((d) => `${d.type}@${d.version}`).join(",");
        setSnoozed(!!key && sessionStorage.getItem(SNOOZE_KEY) === key);
      })
      // A failure here is silent on purpose: the prompt is a nudge, not a gate.
      .catch(() => live && setPending([]));
    return () => {
      live = false;
    };
  }, [user, loading, muted]);

  const accept = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await post<LegalStatus>("/legal/accept", {
        types: pending.map((d) => d.type),
        source: "web",
      });
      setPending([]);
      sessionStorage.removeItem(SNOOZE_KEY);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record that — try again.");
    } finally {
      setBusy(false);
    }
  }, [pending]);

  const later = () => {
    sessionStorage.setItem(SNOOZE_KEY, pending.map((d) => `${d.type}@${d.version}`).join(","));
    setSnoozed(true);
  };

  if (muted || pending.length === 0 || snoozed) return null;

  // Someone who accepted an earlier version is being told their agreement
  // changed; someone new is just being asked. Same sheet, different headline.
  const changed = pending.filter((d) => d.previousVersion);
  const isUpdate = changed.length > 0;

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="legal-consent-title">
      <div className="sheet-panel">
        <span className="eyebrow">{isUpdate ? "Updated" : "Before you continue"}</span>
        <h2 id="legal-consent-title" style={{ margin: "6px 0 8px", fontSize: 21 }}>
          {isUpdate
            ? `We've updated our ${joinTitles(changed)}`
            : `Please accept our ${joinTitles(pending)}`}
        </h2>
        <p className="muted" style={{ fontSize: 12.5, margin: "0 0 14px" }}>
          {isUpdate
            ? "Your account is still active — we just need your agreement to the new wording."
            : "A quick one-time confirmation so you know where you stand with us."}
        </p>

        <div className="dark-panel" style={{ display: "grid", gap: 12, padding: 14 }}>
          {pending.map((d) => (
            <div key={d.type}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {d.title}{" "}
                <span className="muted" style={{ fontWeight: 500, fontSize: 11 }}>
                  v{d.version}
                  {d.previousVersion ? ` · you accepted v${d.previousVersion}` : ""}
                </span>
              </div>
              {d.changeSummary && (
                <p className="muted" style={{ fontSize: 12, margin: "3px 0 0" }}>
                  {d.changeSummary}
                </p>
              )}
              <Link
                href={`/legal/${d.type}`}
                style={{ fontSize: 12, textDecoration: "underline" }}
                onClick={later}
              >
                Read it
              </Link>
            </div>
          ))}
        </div>

        {error && (
          <div
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
            style={{ marginTop: 12 }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={accept} disabled={busy}>
            {busy ? "Saving…" : pending.length === 1 ? "Accept" : pending.length === 2 ? "Accept both" : "Accept all"}
          </button>
          <button className="btn ghost" onClick={later} disabled={busy}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
