"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { get } from "@/lib/api";
import type { LearningData } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { MobileHeader } from "@/components/Nav";

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
  if (!data) return (
    <main className="page">
      <MobileHeader title="My Learning" />
      <div className="dark-panel" style={{ padding: 40, textAlign: "center" }}>
        <p className="muted">Loading your learning…</p>
      </div>
    </main>
  );

  const rows = data[tab];

  return (
    <main className="page">
      <MobileHeader title="My Learning" />
      <span className="eyebrow">Your library</span>
      <h1 className="display" style={{ fontSize: 42 }}>My Learning</h1>

      <div className="pills" style={{ marginTop: 18 }}>
        {(
          [
            ["inProgress", `In progress ${data.counts.inProgress}`],
            ["completed", `Completed ${data.counts.completed}`],
            ["watchlist", `Watchlist ${data.counts.watchlist}`],
            ["liked", `Liked ${data.counts.liked}`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} className={`badge ${tab === t ? "primary" : ""}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="dark-panel" style={{ padding: 40, textAlign: "center", marginTop: 30 }}>
          <Star size={28} className="rating" />
          <h3>{tab === "inProgress" ? "Nothing in progress" : "Nothing here yet"}</h3>
          <p className="muted">{tab === "inProgress" ? "Enroll in a course to start learning." : "Find a course you love and it will show up here."}</p>
          <Link href="/browse" className="btn primary" style={{ display: "inline-block" }}>Browse courses</Link>
        </div>
      ) : (
        <div className="dark-panel" style={{ marginTop: 28, padding: 10 }}>
          {rows.map((c: any) => (
            <Link key={c.id} href={`/courses/${c.slug}`} className="lesson">
              <span>{c.title.charAt(0).toUpperCase()}</span>
              <span style={{ flex: 1 }}>{c.title}</span>
              <span className="muted" style={{ marginRight: 12 }}>
                <Star size={11} fill="currentColor" className="rating" style={{ display: "inline", verticalAlign: "middle" }} /> {c.ratingAvg.toFixed(1)} · {c.level}
              </span>
              {"progressPct" in c && (
                <span style={{ width: 90 }}>
                  <div style={{ height: 3, background: "#2c2924", borderRadius: 5 }}>
                    <div style={{ width: `${c.progressPct}%`, height: "100%", background: "hsl(var(--primary))", borderRadius: 5 }} />
                  </div>
                  <div className="muted mono" style={{ fontSize: 9, marginTop: 3, textAlign: "right" }}>{c.progressPct}%</div>
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
