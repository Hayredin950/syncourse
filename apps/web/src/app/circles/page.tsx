"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { MobileHeader } from "@/components/Nav";

export default function CirclesPage() {
  const { user } = useAuth();

  return (
    <main className="page">
      <MobileHeader title="Circles" />
      <span className="eyebrow">Study circles</span>
      <h1 className="display" style={{ fontSize: 45 }}>Learn in public.<br />Keep the signal.</h1>
      <div className="pills">
        <button className="badge primary">Activity</button>
        <button className="badge">Circles</button>
      </div>
      <div className="dark-panel" style={{ padding: 35, textAlign: "center", marginTop: 34 }}>
        <UsersIcon />
        <h3>{user ? "Start your first circle" : "Follow people to see what they are learning."}</h3>
        <p className="muted" style={{ maxWidth: 420, margin: "0 auto 20px" }}>
          {user
            ? "Follow people back to send them courses directly. Your activity feed fills in as your circle grows."
            : "Start a circle with peers, share progress, and trade the lessons that moved your work forward."}
        </p>
        {user ? (
          <Link href="/browse" className="btn primary" style={{ display: "inline-block" }}>Find courses</Link>
        ) : (
          <Link href="/auth?next=/circles" className="btn primary" style={{ display: "inline-block" }}>Start your first circle</Link>
        )}
      </div>
    </main>
  );
}

function UsersIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--accent))" strokeWidth="1.8" style={{ marginBottom: 14 }}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
