"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { get } from "@/lib/api";
import type { LearningData } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { EmptyState } from "@/components/EmptyState";

type Tab = "inProgress" | "completed" | "watchlist" | "liked";

export default function MyLearningPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<LearningData | null>(null);
  const [tab, setTab] = useState<Tab>("inProgress");

  useEffect(() => {
    if (!token) {
      router.push("/auth?next=/my-learning");
      return;
    }
    get<LearningData>("/me/learning").then(setData).catch(() => {});
  }, [token, router]);

  if (!token) return null;
  if (!data) return <div className="p-4 text-center text-sm text-muted">Loading your learning…</div>;

  const rows = data[tab];

  return (
    <div className="pb-6">
      <div className="border-b border-border px-4 py-3">
        <h1 className="text-lg font-bold text-text">My Learning</h1>
        <div className="mt-2 flex gap-2">
          {(
            [
              ["inProgress", `In progress ${data.counts.inProgress}`],
              ["completed", `Completed ${data.counts.completed}`],
              ["watchlist", `Watchlist ${data.counts.watchlist}`],
              ["liked", `Liked ${data.counts.liked}`],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                tab === t ? "bg-accent text-black" : "bg-surface text-muted hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title={tab === "inProgress" ? "Nothing in progress" : "Nothing here yet"}
            body={tab === "inProgress" ? "Enroll in a course to start learning." : "Find a course you love and it will show up here."}
            action={
              <Link href="/browse" className="mt-2 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-black">
                Browse courses
              </Link>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-4">
          {rows.map((c: any) => (
            <Link
              key={c.id}
              href={`/courses/${c.slug}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5 hover:bg-surface-hover"
            >
              <div className="h-[64px] w-[43px] shrink-0 overflow-hidden rounded-md bg-bg">
                {c.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-1 text-sm font-medium text-text">{c.title}</div>
                <div className="mt-0.5 text-[11px] text-muted">★ {c.ratingAvg.toFixed(1)} · {c.level}</div>
                {"progressPct" in c && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${c.progressPct}%` }} />
                    </div>
                    <span className="text-[10px] text-dim">{c.progressPct}%</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
