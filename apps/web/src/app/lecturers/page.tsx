"use client";

import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import type { LecturerRow } from "@/lib/types";
import { MobileHeader } from "@/components/Nav";
import { LecturerCard } from "@/components/EntityCard";

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

      {loading ? (
        <div className="grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : (
        <div className="grid">
          {lecturers.map((l) => (
            <LecturerCard key={l.id} lecturer={l} />
          ))}
        </div>
      )}
    </main>
  );
}
