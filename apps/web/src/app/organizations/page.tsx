"use client";

import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import type { OrganizationRow } from "@/lib/types";
import { MobileHeader } from "@/components/Nav";
import { PublisherCard } from "@/components/EntityCard";

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
            <PublisherCard key={o.id} org={o} />
          ))}
        </div>
      )}
    </main>
  );
}
