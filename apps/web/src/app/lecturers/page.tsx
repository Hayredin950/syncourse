"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { get } from "@/lib/api";
import type { LecturerRow } from "@/lib/types";
import { MobileHeader } from "@/components/Nav";

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
            <Link
              key={l.id}
              href={`/lecturers/${l.slug}`}
              className="dark-panel"
              style={{ padding: 16, display: "block" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="avatar" style={{ width: 52, height: 52, fontSize: 20, borderRadius: 14 }}>
                  {l.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.photoUrl} alt="" className="h-full w-full rounded-xl object-cover" />
                  ) : (
                    l.name.charAt(0)
                  )}
                </span>
                <div className="min-w-0">
                  <strong style={{ fontSize: 14 }}>{l.name}</strong>
                  {l.credentials && <div className="muted line-clamp-1" style={{ fontSize: 11 }}>{l.credentials}</div>}
                  <div className="muted" style={{ fontSize: 11 }}>{l.courseCount} courses</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
