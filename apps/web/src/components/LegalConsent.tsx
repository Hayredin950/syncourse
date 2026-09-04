"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import Modal from "./Modal";
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
    <Modal
      open
      onClose={later}
      title={isUpdate ? "Your agreement has changed" : "Before you continue"}
      subtitle={
        isUpdate
          ? "Your account is still active — we just need your agreement to the new wording."
          : "A quick one-time confirmation so you know where you stand with us."
      }
      width={460}
      footer={
        <div className="sheet-foot__row">
          <button type="button" className="btn ghost" onClick={later} disabled={busy}>
            Later
          </button>
          <button type="button" className="btn primary btn--grow" onClick={accept} disabled={busy}>
            {busy ? "Saving…" : pending.length === 1 ? "Accept" : pending.length === 2 ? "Accept both" : "Accept all"}
          </button>
        </div>
      }
    >
      <p className="sheet-lead">
        {isUpdate
          ? `We've updated our ${joinTitles(changed)}.`
          : `Please accept our ${joinTitles(pending)} to carry on.`}
      </p>

      <div className="legal-docs">
        {pending.map((d) => (
          <div key={d.type} className="legal-doc">
            <div className="legal-doc__title">
              {d.title}{" "}
              <span className="muted" style={{ fontWeight: 500, fontSize: 11 }}>
                v{d.version}
                {d.previousVersion ? ` · you accepted v${d.previousVersion}` : ""}
              </span>
            </div>
            {d.changeSummary && (
              <p className="muted" style={{ fontSize: 12, margin: "3px 0 0", lineHeight: 1.5 }}>
                {d.changeSummary}
              </p>
            )}
            {/* Was a 12px underlined sentence, which is 12px of click target. */}
            <Link href={`/legal/${d.type}`} className="btn ghost btn--sm" onClick={later}>
              Read it <ArrowRight size={12} />
            </Link>
          </div>
        ))}
      </div>

      {error && (
        <p className="sheet-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
