"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { get } from "@/lib/api";
import type { AdminResourceDetail } from "@/lib/types";
import { ResourceForm } from "@/components/admin/ResourceForm";

export default function EditResourcePageClient() {
  const { slug } = useParams<{ slug: string }>();
  const [resource, setResource] = useState<AdminResourceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        <div className="admin-page-head__actions">
          <Link href={`/resources/${slug}`} className="admin-btn admin-btn--ghost">
            <ExternalLink size={13} /> View on site
          </Link>
        </div>
      </div>

      {error && <p className="admin-empty">{error}</p>}
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
