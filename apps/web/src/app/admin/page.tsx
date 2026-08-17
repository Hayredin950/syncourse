"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { del, get, patch } from "@/lib/api";
import type { AdminCourseRow, AdminUserRow } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { useToast } from "@/lib/useToast";

type Tab = "courses" | "users";

export default function AdminPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("courses");
  const [courses, setCourses] = useState<AdminCourseRow[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast, setToast } = useToast();

  useEffect(() => {
    if (token && !user) return; // auth still resolving
    if (!token || !user?.isStaff) return;
    Promise.all([
      get<AdminCourseRow[]>("/admin/courses"),
      get<AdminUserRow[]>("/admin/users"),
    ])
      .then(([c, u]) => {
        setCourses(c);
        setUsers(u);
      })
      .catch(() => setToast("Failed to load admin data"))
      .finally(() => setLoading(false));
  }, [token, user, setToast]);

  if (!token) {
    return (
      <div className="p-4 text-center text-sm text-muted">
        <Link href="/auth?next=/admin" className="font-medium text-accent">Sign in</Link> to access the admin panel.
      </div>
    );
  }
  if (user && !user.isStaff) {
    return <div className="p-4 text-center text-sm text-muted">Admin access is limited to staff accounts.</div>;
  }
  if (loading) {
    return <div className="p-4 text-center text-sm text-muted">Loading…</div>;
  }

  const remove = async (slug: string) => {
    if (!confirm("Delete this course? Students' progress history is kept (soft delete).")) return;
    try {
      await del(`/admin/courses/${slug}`);
      setCourses((p) => p.filter((c) => c.slug !== slug));
      setToast("Course deleted");
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const setRole = async (u: AdminUserRow, isStaff: boolean) => {
    setBusyId(u.id);
    try {
      const res = await patch<{ isStaff: boolean; message: string }>(`/admin/users/${u.id}/role`, { isStaff });
      setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, isStaff: res.isStaff } : x)));
      setToast(res.message);
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-dim">Admin</div>
          <h1 className="text-lg font-bold text-text">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-full border border-border p-0.5">
            {(["courses", "users"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                  tab === t ? "bg-accent text-black" : "text-muted hover:text-text"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "courses" && (
            <Link href="/admin/courses/new" className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-black">
              + New course
            </Link>
          )}
        </div>
      </div>

      {tab === "courses" && (
        <>
          <div className="px-4 pt-3 text-[11px] text-dim">Courses · {courses.length}</div>
          <div className="divide-y divide-border">
            {courses.length === 0 && <div className="p-6 text-center text-sm text-dim">No courses yet — create your first one.</div>}
            {courses.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-surface">
                  {c.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`line-clamp-1 text-sm font-medium ${c.deleted ? "text-dim line-through" : "text-text"}`}>
                      {c.title}
                    </span>
                    {c.deleted && <span className="rounded bg-danger/20 px-1 text-[9px] font-bold text-danger">DELETED</span>}
                    {c.isPremium && <span className="rounded bg-accent px-1 text-[9px] font-bold text-black">PREMIUM</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-dim">
                    {c.contentType} · {c.sectionCount} sections · ★ {c.ratingAvg.toFixed(1)} · {c.enrollmentCount.toLocaleString()} students
                    {c.level ? ` · ${c.level}` : ""} · {formatDate(c.updatedAt)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Link href={`/admin/courses/${c.slug}/edit`} className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-text">
                    Edit
                  </Link>
                  {!c.deleted && (
                    <button onClick={() => remove(c.slug)} className="rounded-full border border-danger/40 px-3 py-1 text-xs text-danger hover:bg-danger/10">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "users" && (
        <>
          <div className="px-4 pt-3 text-[11px] text-dim">Users · {users.length} — promote or demote admins from here.</div>
          <div className="divide-y divide-border">
            {users.length === 0 && <div className="p-6 text-center text-sm text-dim">No users yet.</div>}
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface">
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-accent">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="line-clamp-1 text-sm font-medium text-text">{u.name}</span>
                    {u.id === user?.id && <span className="rounded bg-accent-soft px-1 text-[9px] font-bold text-accent">YOU</span>}
                    {u.isStaff && <span className="rounded bg-accent px-1 text-[9px] font-bold text-black">ADMIN</span>}
                    {u.isVerified && <span className="rounded bg-success/20 px-1 text-[9px] font-bold text-success">VERIFIED</span>}
                    {u.planType === "premium" && <span className="rounded border border-accent/40 px-1 text-[9px] font-bold text-accent">PREMIUM</span>}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-dim">
                    {u.email} · @{u.username} · joined {formatDate(u.createdAt)} · {u.enrollments} enrolled · {u.reviews} reviews · {u.lists} lists
                  </div>
                </div>
                {u.id !== user?.id && (
                  <button
                    onClick={() => setRole(u, !u.isStaff)}
                    disabled={busyId === u.id}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      u.isStaff
                        ? "border border-danger/40 text-danger hover:bg-danger/10"
                        : "bg-accent text-black hover:opacity-90"
                    } disabled:opacity-50`}
                  >
                    {busyId === u.id ? "…" : u.isStaff ? "Demote" : "Make admin"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto w-fit rounded-full bg-surface-raised px-4 py-2 text-xs text-text shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
