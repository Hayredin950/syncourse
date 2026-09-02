"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ResourceForm } from "@/components/admin/ResourceForm";

/** The admin layout gates on a staff session, so this page only frames the form. */
export default function NewResourcePage() {
  return (
    <div>
      <Link href="/admin/resources" className="admin-back">
        <ArrowLeft size={13} /> Resources
      </Link>
      <div className="admin-page-head">
        <div>
          <h1>New resource</h1>
          <p className="page-desc">
            A title plus either a body or one attachment is enough. Everything else can be filled in later.
          </p>
        </div>
      </div>
      <ResourceForm />
    </div>
  );
}
