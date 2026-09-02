"use client";

import { useEffect, useState } from "react";
import { CourseDetailView } from "./courses/[slug]/page-client";
import { ResourceDetailView } from "./resources/[slug]/page-client";

/**
 * Smart 404 — Cloudflare Pages serves this page for ANY unmatched URL.
 *
 * The site is statically exported, so a course or resource created after the
 * last build (e.g. via the Telegram bot or the admin console) has no pre-built
 * HTML file. Instead of a dead 404, this page detects /courses/<slug> and
 * /resources/<slug> paths, verifies the row exists on the API, and renders the
 * full detail view — so new content goes live instantly with zero redeploys.
 */
export default function NotFound() {
  const [hit, setHit] = useState<{ kind: "course" | "resource"; slug: string } | null | undefined>(
    undefined,
  );

  useEffect(() => {
    const path = window.location.pathname;
    const course = path.match(/^\/courses\/([^/]+)\/?$/);
    if (course) {
      setHit({ kind: "course", slug: decodeURIComponent(course[1]) });
      return;
    }
    const resource = path.match(/^\/resources\/([^/]+)\/?$/);
    if (resource) {
      setHit({ kind: "resource", slug: decodeURIComponent(resource[1]) });
      return;
    }
    setHit(null);
  }, []);

  if (hit === undefined) {
    return (
      <div style={{ padding: "40vh 20px", textAlign: "center" }}>
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (hit === null) {
    return (
      <div style={{ padding: "20vh 20px", textAlign: "center" }}>
        <h1 className="display" style={{ fontSize: 48 }}>404</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          This page could not be found.
        </p>
        <a className="btn primary" href="/" style={{ marginTop: 20, display: "inline-block" }}>
          Go home
        </a>
      </div>
    );
  }
  // Looks like a detail URL — render the real page, which fetches from the API
  // and shows its own not-found state if the slug is genuinely dead.
  return hit.kind === "course" ? (
    <CourseDetailView slug={hit.slug} />
  ) : (
    <ResourceDetailView slug={hit.slug} />
  );
}

