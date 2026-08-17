"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { get } from "@/lib/api";

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
    <div className="p-5">
      <h1 className="text-lg font-bold text-text">{TITLES[type] ?? "Legal"}</h1>
      {loading ? (
        <div className="mt-3 text-sm text-muted">Loading…</div>
      ) : (
        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">{body}</div>
      )}
    </div>
  );
}
