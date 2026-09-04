"use client";

import { useCallback, useEffect, useState } from "react";
import { get } from "@/lib/api";
import { plural } from "@/lib/format";
import type { LecturerRow } from "@/lib/types";
import { MobileHeader } from "@/components/Nav";
import { LecturerCard } from "@/components/EntityCard";
import { SkEntities } from "@/components/Skeleton";
import { LoadError } from "@/components/LoadError";

export default function LecturersPage() {
  const [lecturers, setLecturers] = useState<LecturerRow[]>([]);
  const [loading, setLoading] = useState(true);
  /* A dropped request used to render "No lecturers yet", which is a claim about
     the catalogue rather than about the connection. */
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    get<LecturerRow[]>("/lecturers")
      .then(setLecturers)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  return (
    <main className="page">
      <MobileHeader title="Lecturers" />
      <span className="eyebrow">Instructors</span>
      <h1 className="display" style={{ fontSize: 38, marginBottom: 5 }}>
        Lecturers
      </h1>
      <p className="muted mono" style={{ fontSize: 11, margin: 0 }}>
        {loading ? "…" : failed ? "—" : plural(lecturers.length, "instructor")}
      </p>

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <SkEntities n={12} label="Loading lecturers" />
        ) : failed ? (
          <LoadError title="We couldn't load the lecturers" onRetry={load} />
        ) : lecturers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🧑‍🏫</div>
            <h3 style={{ margin: "0 0 6px" }}>No lecturers yet</h3>
            <p>Instructors appear here as soon as their first course is published.</p>
          </div>
        ) : (
          <div className="grid">
            {lecturers.map((l) => (
              <LecturerCard key={l.id} lecturer={l} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
