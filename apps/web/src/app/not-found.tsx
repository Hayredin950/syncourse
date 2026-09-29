"use client";

import { useEffect, useState } from "react";
import { Sk } from "@/components/Skeleton";
import { CourseDetailView } from "./courses/[slug]/page-client";
import { ResourceDetailView } from "./resources/[slug]/page-client";
import LecturerPage from "./lecturers/[slug]/page-client";
import PublisherPage from "@/components/PublisherPage";

/**
 * Smart 404 — Cloudflare Pages serves this page for ANY unmatched URL.
 *
 * That build is a static export (`STATIC_EXPORT=1`), so a course, resource,
 * lecturer or channel created after the last build (via the Telegram bot or the
 * admin console) has no pre-built HTML file. Instead of a dead 404, this page
 * detects a detail URL, verifies the row exists on the API by rendering the real
 * view, and shows that view's own not-found state if the slug is genuinely dead
 * — so new content goes live instantly with zero redeploys.
 *
 * This is the fallback only for the exported build. The Vercel deployment is a
 * Next.js server, where every one of these routes renders on demand and never
 * reaches this page.
 */
type Hit =
  | { kind: "course"; slug: string }
  | { kind: "resource"; slug: string }
  | { kind: "lecturer"; slug: string }
  | { kind: "publisher"; slug: string };

/** First capture group is the slug. */
const ROUTES: [RegExp, Hit["kind"]][] = [
  [/^\/courses\/([^/]+)\/?$/, "course"],
  [/^\/resources\/([^/]+)\/?$/, "resource"],
  [/^\/lecturers\/([^/]+)\/?$/, "lecturer"],
  // The publishers route renders the same organization row as /organizations.
  [/^\/organizations\/([^/]+)\/?$/, "publisher"],
  [/^\/publishers\/([^/]+)\/?$/, "publisher"],
];

export default function NotFound() {
  const [hit, setHit] = useState<Hit | null | undefined>(undefined);

  useEffect(() => {
    const path = window.location.pathname;
    for (const [pattern, kind] of ROUTES) {
      const match = path.match(pattern);
      if (match) {
        setHit({ kind, slug: decodeURIComponent(match[1]) } as Hit);
        return;
      }
    }
    setHit(null);
  }, []);

  if (hit === undefined) {
    return (
      <main className="page" role="status" aria-busy="true">
        <span className="sk-label">Checking that link…</span>
        <Sk className="sk-title" w={45} />
        <div className="sk-text">
          <Sk className="sk-line" />
          <Sk className="sk-line" w={60} />
        </div>
      </main>
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
  switch (hit.kind) {
    case "course":
      return <CourseDetailView slug={hit.slug} />;
    case "resource":
      return <ResourceDetailView slug={hit.slug} />;
    case "lecturer":
      return <LecturerPage slug={hit.slug} />;
    case "publisher":
      return <PublisherPage slug={hit.slug} backHref="/organizations" />;
  }
}
