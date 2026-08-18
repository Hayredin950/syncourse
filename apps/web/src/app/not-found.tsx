"use client";

import { useEffect, useState } from "react";
import { CourseDetailView } from "./courses/[slug]/page-client";

/**
 * Smart 404 — Cloudflare Pages serves this page for ANY unmatched URL.
 *
 * The site is statically exported, so a course created after the last build
 * (e.g. via the Telegram bot) has no pre-built HTML file. Instead of a dead
 * 404, this page detects /courses/<slug> paths, verifies the course exists on
 * the API, and renders the full course detail — so new courses go live
 * instantly with zero redeploys.
 */
export default function NotFound() {
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    const m = window.location.pathname.match(/^\/courses\/([^/]+)\/?$/);
    if (m) setSlug(decodeURIComponent(m[1]));
    else setSlug("");
  }, []);

  if (slug === null) {
    return (
      <div style={{ padding: "40vh 20px", textAlign: "center" }}>
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (slug === "") {
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
  // looks like a course URL — render the real course page (fetches from API)
  return <CourseDetailView slug={slug} />;
}
