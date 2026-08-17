"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { get } from "@/lib/api";
import type { OrganizationRow } from "@/lib/types";
import { MobileHeader } from "@/components/Nav";

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<OrganizationRow[]>("/organizations")
      .then(setOrgs)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page">
      <MobileHeader title="Channels & Schools" />
      <span className="eyebrow">Publishers</span>
      <h1 className="display" style={{ fontSize: 38, marginBottom: 5 }}>
        Channels &amp; Schools
      </h1>
      <p className="muted mono" style={{ fontSize: 11, margin: 0 }}>
        {loading ? "…" : `${orgs.length} publishers`}
      </p>

      {loading ? (
        <div className="grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : (
        <div className="grid">
          {orgs.map((o) => (
            <Link
              key={o.id}
              href={`/organizations/${o.slug}`}
              className="dark-panel"
              style={{ padding: 16, display: "block" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="avatar" style={{ width: 52, height: 52, fontSize: 20, borderRadius: 14 }}>
                  {o.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.logoUrl} alt="" className="h-full w-full rounded-xl object-cover" />
                  ) : (
                    o.name.charAt(0)
                  )}
                </span>
                <div className="min-w-0">
                  <strong style={{ fontSize: 14 }}>{o.name}</strong>
                  {o.description && <div className="muted line-clamp-1" style={{ fontSize: 11 }}>{o.description}</div>}
                  <div className="muted" style={{ fontSize: 11 }}>
                    {o.subscribers.toLocaleString()} subscribers · {o.courseCount} courses
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
