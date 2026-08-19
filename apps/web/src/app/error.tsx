"use client";

import { useEffect } from "react";

/**
 * Root client error boundary. When a page throws (e.g. a transient glitch right
 * after navigation), Next.js would otherwise show a bare "This page couldn't
 * load" screen. This keeps the brand and gives the visitor one-tap recovery.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("syncourse error boundary caught:", error);
  }, [error]);

  return (
    <main className="page">
      <div className="dark-panel" style={{ padding: 48, textAlign: "center", maxWidth: 480, margin: "12vh auto" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
        <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          A hiccup just happened. Your account is safe — reload and you&apos;ll be right back.
        </p>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
    </main>
  );
}