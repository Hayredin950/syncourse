"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { MobileHeader } from "@/components/Nav";

export default function VerifyPage() {
  const router = useRouter();
  const [serial, setSerial] = useState("");

  return (
    <main className="page" style={{ maxWidth: 560 }}>
      <MobileHeader title="Certificates" />
      <div className="dark-panel dark-panel--pad-lg" style={{ marginTop: 12 }}>
        <ShieldCheck size={28} className="rating" />
        <h1 className="display" style={{ fontSize: 22, margin: "8px 0 4px" }}>Verify a certificate</h1>
        <p className="muted" style={{ fontSize: 12, marginTop: 0, lineHeight: 1.6 }}>
          Every Syncourse certificate carries a serial number on its PDF. Type it below to see the
          public record — learner name, course and issue date. A certificate is issued after every
          lesson or module in a course is marked complete; that is self-reported progress, not an
          exam or an accreditation.
        </p>
        <form
          style={{ display: "flex", gap: 8, marginTop: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            const clean = serial.trim().toUpperCase();
            if (clean) router.push(`/certificates/${encodeURIComponent(clean)}`);
          }}
        >
          <input
            className="input"
            placeholder="SYN-XXXX-XXXX"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            style={{ flex: 1 }}
            autoFocus
          />
          <button className="btn primary" type="submit" style={{ fontSize: 12 }}>
            Check <ArrowRight size={13} />
          </button>
        </form>
      </div>
    </main>
  );
}
