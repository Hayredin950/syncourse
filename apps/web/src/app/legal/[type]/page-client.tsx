"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { get } from "@/lib/api";
import { MobileHeader } from "@/components/Nav";

const TITLES: Record<string, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  refund: "Refund Policy",
};

export async function generateStaticParams() {
  return [{ type: "terms" }, { type: "privacy" }, { type: "refund" }];
}

export default function LegalPage() {
  const { type } = useParams<{ type: string }>();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<{ type: string; version: string; bodyMd: string }[]>(`/legal?type=${type}`)
      .then((docs) => setBody(docs.find((d) => d.type === type)?.bodyMd ?? ""))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type]);

  return (
    <main className="page legal">
      <MobileHeader title="Legal" />
      <span className="eyebrow">Syncourse legal</span>
      <h1 className="display" style={{ fontSize: 46 }}>{TITLES[type] ?? "Legal"}</h1>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="whitespace-pre-wrap">{body || "Document coming soon."}</div>
      )}
    </main>
  );
}
