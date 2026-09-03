"use client";

import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import type { LecturerRow } from "@/lib/types";
import { MobileHeader } from "@/components/Nav";
import { LecturerCard } from "@/components/EntityCard";
import { SkEntities } from "@/components/Skeleton";

export default function LecturersPage() {
  const [lecturers, setLecturers] = useState<LecturerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<LecturerRow[]>("/lecturers")
      .then(setLecturers)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page">
      <MobileHeader title="Lecturers" />
      <span className="eyebrow">Instructors</span>
      <h1 className="display" style={{ fontSize: 38, marginBottom: 5 }}>
        Lecturers
      </h1>
      <p className="muted mono" style={{ fontSize: 11, margin: 0 }}>
        {loading ? "…" : `${lecturers.length} instructors`}
      </p>

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <SkEntities n={12} label="Loading lecturers" />
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
