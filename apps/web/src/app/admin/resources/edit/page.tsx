"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, AlertTriangle, ExternalLink } from "lucide-react";
import { get } from "@/lib/api";
import type { AdminResourceDetail } from "@/lib/types";
import AdminEmpty from "@/components/admin/AdminEmpty";
import { ResourceForm } from "@/components/admin/ResourceForm";

/**
 * Edit a resource — `?slug=` rather than /admin/resources/[slug]/edit.
 *
 * The site is a static export, so a dynamic segment only exists for the slugs
 * `generateStaticParams()` returned at build time. Every resource published
 * after that build 404'd on its own edit link, which is the one link the author
 * needs the moment they create it. A query parameter is a single exported page
 * that resolves any slug at runtime — the same reason /admin/courses/detail
 * already reads ?slug=.
 */
export default function EditResourcePage() {
  return (
    <Suspense fallback={<span className="admin-skeleton" style={{ height: 220, display: "block" }} />}>
      <EditResource />
    </Suspense>
  );
}

function EditResource() {
  const slug = useSearchParams().get("slug") ?? "";
  const [resource, setResource] = useState<AdminResourceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setError("No resource selected.");
      return;
    }
    get<AdminResourceDetail>(`/admin/resources/${slug}`)
      .then(setResource)
      .catch((e) => setError(e instanceof Error ? e.message : "Resource not found"));
  }, [slug]);

  return (
    <div>
      <Link href="/admin/resources" className="admin-back">
        <ArrowLeft size={13} /> Resources
      </Link>

      <div className="admin-page-head">
        <div>
          <h1>{resource ? `Edit ${resource.title}` : "Edit resource"}</h1>
          <p className="page-desc">/resources/{slug}</p>
        </div>
        {slug && (
          <div className="admin-page-head__actions">
            <Link href={`/resources/${slug}`} className="admin-btn admin-btn--ghost">
              <ExternalLink size={13} /> View on site
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div className="admin-card">
          <AdminEmpty
            icon={<AlertTriangle size={18} />}
            title={slug ? "Could not open that resource" : "No resource selected"}
            hint={slug ? error : "This form edits one resource at a time — pick one from the list."}
            action={{ label: "Browse resources", href: "/admin/resources" }}
          />
        </div>
      )}
      {!error && !resource && (
        <div className="admin-stack">
          <span className="admin-skeleton" style={{ height: 140, display: "block" }} />
          <span className="admin-skeleton" style={{ height: 220, display: "block" }} />
        </div>
      )}
      {resource && <ResourceForm initial={resource} />}
    </div>
  );
}
