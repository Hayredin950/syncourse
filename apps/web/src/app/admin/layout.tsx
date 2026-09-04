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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();

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
