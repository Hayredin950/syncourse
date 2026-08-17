"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();

  if (!token) {
    return (
      <div className="admin-gate">
        <p className="text-muted">
          <Link href="/auth?next=/admin" className="font-medium text-accent">
            Sign in
          </Link>{" "}
          to access the admin panel.
        </p>
      </div>
    );
  }
  if (user && !user.isStaff) {
    return <div className="admin-gate">Admin access is limited to staff accounts.</div>;
  }

  return <AdminShell>{children}</AdminShell>;
}
