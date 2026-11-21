"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Download, ShieldX } from "lucide-react";
import { apiUrl, get } from "@/lib/api";
import { MobileHeader } from "@/components/Nav";
import { formatDate } from "@/lib/format";

interface Verified {
  valid: boolean;
  serial: string;
  issuedAt: string;
  learnerName: string;
  courseTitle: string;
  courseSlug: string;
  unitLabel: "lesson" | "module";
  thumbnailUrl: string | null;
}

export default function CertificatePage() {
  const { serial } = useParams<{ serial: string }>();
  const router = useRouter();
  const [data, setData] = useState<Verified | null>(null);
  const [missing, setMissing] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!serial) return;
    get<Verified>(`/certificates/${encodeURIComponent(serial)}`)
      .then(setData)
      .catch(() => setMissing(true));
  }, [serial]);

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <MobileHeader title="Certificate" />

      {missing ? (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <ShieldX size={40} className="muted" />
          <h1 className="display" style={{ fontSize: 22, marginTop: 10 }}>No certificate matches that number</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            Check the serial printed on the PDF. Certificates are only issued after every lesson or
            module in a course is marked complete.
          </p>
        </div>
      ) : !data ? (
        <div className="dark-panel dark-panel--pad-lg" role="status" aria-busy="true">
          Checking the certificate…
        </div>
      ) : (
        <>
          <div className="dark-panel dark-panel--pad-lg" style={{ marginTop: 12, textAlign: "center" }}>
            <div className="eyebrow">Syncourse</div>
            <h1 className="display" style={{ margin: "6px 0 2px", fontSize: 26 }}>
              Certificate of completion
            </h1>
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              Verified record · issued {formatDate(data.issuedAt)}
            </p>

            <div style={{ margin: "26px 0 8px", fontSize: 13 }} className="muted">This certifies that</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{data.learnerName}</div>
            <div style={{ margin: "18px 0 4px", fontSize: 13 }} className="muted">
              completed every {data.unitLabel ?? "lesson"} in
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{data.courseTitle}</div>

            <div
              style={{
                marginTop: 26,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: "1px solid var(--accent)",
                borderRadius: 999,
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <CheckCircle2 size={14} /> Valid
            </div>

            <div className="mono" style={{ marginTop: 16, fontSize: 12, letterSpacing: 1 }}>
              {data.serial}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 18 }}>
              <a
                href={`${apiUrl()}/api/certificates/${encodeURIComponent(data.serial)}/pdf`}
                className="btn primary"
                style={{ fontSize: 12 }}
              >
                <Download size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Download PDF
              </a>
              <Link href={`/courses/${data.courseSlug}`} className="btn" style={{ fontSize: 12 }}>
                View the course
              </Link>
            </div>

            <p className="muted" style={{ fontSize: 10.5, marginTop: 22, lineHeight: 1.6 }}>
              This certificate records that the learner marked every {data.unitLabel ?? "lesson"} complete
              on Syncourse. It is not an examination, accreditation or a guarantee of competence.
            </p>
          </div>

          <div className="dark-panel dark-panel--pad" style={{ marginTop: 16 }}>
            <strong style={{ fontSize: 13 }}>Check another certificate</strong>
            <form
              style={{ display: "flex", gap: 8, marginTop: 10 }}
              onSubmit={(e) => {
                e.preventDefault();
                const clean = query.trim().toUpperCase();
                if (clean) router.push(`/certificates/${encodeURIComponent(clean)}`);
              }}
            >
              <input
                className="input"
                placeholder="SYN-XXXX-XXXX"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn primary" type="submit" style={{ fontSize: 12 }}>
                Verify <ArrowRight size={13} />
              </button>
            </form>
          </div>
        </>
      )}
    </main>
  );
}
