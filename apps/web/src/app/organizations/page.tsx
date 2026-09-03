"use client";

import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import type { OrganizationRow } from "@/lib/types";
import { MobileHeader } from "@/components/Nav";
import { PublisherCard } from "@/components/EntityCard";
import { SkEntities } from "@/components/Skeleton";

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

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <SkEntities n={12} label="Loading channels" />
        ) : orgs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🏫</div>
            <h3 style={{ margin: "0 0 6px" }}>No channels yet</h3>
            <p>Channels and schools appear here once their courses go live.</p>
          </div>
        ) : (
          <div className="grid">
            {orgs.map((o) => (
              <PublisherCard key={o.id} org={o} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
