"use client";

import Link from "next/link";
import { ArrowLeft, Lock, ShieldOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";
// Console-only design system — importing it here keeps it off every public page.
import "./admin.css";

/** The console replaces the public chrome entirely (see components/Shell), so
 *  every gate has to carry its own way back to the site. */
function Gate({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="admin-gate">
      <div className="admin-gate__card">
        <span className="admin-gate__icon">{icon}</span>
        <h1>{title}</h1>
        <p>{children}</p>
        <Link href="/" className="admin-btn admin-btn--ghost">
          <ArrowLeft size={13} /> Back to Syncourse
        </Link>
      </div>
    </div>
  );
}

/**
 * The console is a client component, so it can't `export const metadata`.
 * Rendering the meta tag is the supported way to set it from here — React
 * hoists it into <head>. robots.txt already asks crawlers to stay out; this is
 * the part that actually keeps an already-known URL out of an index.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <AdminGate>{children}</AdminGate>
    </>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, token, loading } = useAuth();

  // Auth hydration is a client-side read of localStorage plus one /users/me
  // call. Without this branch the gate below rendered "Staff sign-in required"
  // for a frame on every load, even for a signed-in admin.
  if (loading) {
    return (
      <div className="admin-gate" aria-busy="true" aria-live="polite">
        <div className="admin-skeleton" style={{ width: 190, height: 12, margin: "0 auto 10px" }} />
        <p style={{ margin: 0, fontSize: 12 }}>Checking your session…</p>
      </div>
    );
  }

  if (!token) {
    return (
      <Gate icon={<Lock size={18} />} title="Staff sign-in required">
        The admin console is behind an account.{" "}
        <Link href="/auth?next=/admin" className="admin-cell-link" style={{ fontWeight: 600 }}>
          Sign in
        </Link>{" "}
        to continue.
      </Gate>
    );
  }
  if (user && !user.isStaff) {
    return (
      <Gate icon={<ShieldOff size={18} />} title="Not a staff account">
        You are signed in as {user.username ? `@${user.username}` : user.email}, which does not have console access.
      </Gate>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
