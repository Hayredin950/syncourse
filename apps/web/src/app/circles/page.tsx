"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function CirclesPage() {
  const { user } = useAuth();

  return (
    <div className="pb-6">
      <div className="border-b border-border px-4 py-3">
        <h1 className="text-lg font-bold text-text">Circles</h1>
        <div className="mt-2 flex gap-2 text-xs">
          <span className="rounded-full bg-accent px-3 py-1 font-medium text-black">Activity</span>
          <span className="rounded-full bg-surface px-3 py-1 text-muted">Circles</span>
        </div>
      </div>

      <div className="p-4">
        {!user ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-center">
            <div className="text-3xl">👥</div>
            <div className="mt-2 text-sm font-medium text-text">Follow people to see what they&apos;re watching</div>
            <p className="mx-auto mt-1 max-w-[260px] text-xs text-muted">
              See what your people watch, rate and save — then discover courses through them.
            </p>
            <Link href="/auth?next=/circles" className="mt-3 inline-block rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-black">
              Sign in
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface p-6 text-center">
            <div className="text-3xl">🪄</div>
            <div className="mt-2 text-sm font-medium text-text">Start your first circle</div>
            <p className="mx-auto mt-1 max-w-[260px] text-xs text-muted">
              Follow people back to send them courses directly. Your activity feed fills in as your circle grows.
            </p>
            <div className="mt-3 flex justify-center gap-2 text-xs">
              <Link href="/browse" className="rounded-full bg-accent px-4 py-1.5 font-bold text-black">
                Find courses
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
