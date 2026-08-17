"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { get } from "@/lib/api";
import type { CourseSummary } from "@/lib/types";
import { Search } from "lucide-react";
import { CourseRow } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";

interface SearchData {
  total: number;
  courses: CourseSummary[];
  lecturers: { id: string; name: string; slug: string; photoUrl: string | null }[];
  organizations: { id: string; name: string; slug: string; logoUrl: string | null }[];
  trending: string[];
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return Ctor ? new Ctor() : null;
}

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [data, setData] = useState<SearchData | null>(null);
  const [trending, setTrending] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceUnsupported, setVoiceUnsupported] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toggleVoice = () => {
    const rec = getSpeechRecognition();
    if (!rec) {
      setVoiceUnsupported(true);
      setTimeout(() => setVoiceUnsupported(false), 2500);
      return;
    }
    if (listening) {
      rec.stop();
      setListening(false);
      return;
    }
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) setQ(transcript.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  useEffect(() => {
    get<{ trending: string[] }>("/search/trending").then((d) => setTrending(d.trending)).catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!q.trim()) {
      setData(null);
      return;
    }
    debounce.current = setTimeout(() => {
      get<SearchData>(`/search?q=${encodeURIComponent(q)}`).then(setData).catch(() => {});
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [q]);

  return (
    <main className="page">
      <MobileHeader title="Search" />
      <span className="eyebrow">Course search</span>
      <h1 className="display" style={{ fontSize: 38, marginBottom: 18 }}>Find your next course.</h1>
      <div className="top-search" style={{ maxWidth: "none", height: 44 }}>
        <Search size={15} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by course, lecturer, or topic"
        />
        <button
          onClick={toggleVoice}
          title="Voice search"
          className={`icon-btn`}
          style={{ marginLeft: "auto", padding: "6px 10px", background: listening ? "hsl(var(--primary))" : "transparent", border: 0 }}
        >
          {listening ? "■" : "🎙"}
        </button>
      </div>
      {voiceUnsupported && (
        <div className="mt-2 text-center text-[11px] text-muted">
          Voice search isn&apos;t supported in this browser — try Chrome or Edge.
        </div>
      )}
      {listening && (
        <div className="mt-2 text-center text-[11px] text-accent">Listening… speak now</div>
      )}

      {!q.trim() && (
        <div className="px-4 pt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">Everyone searching</div>
          <div className="flex flex-wrap gap-2">
            {trending.map((t) => (
              <button
                key={t}
                onClick={() => setQ(t)}
                className="rounded-full bg-surface px-3 py-1.5 text-xs text-muted hover:text-text"
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-8 text-center text-xs text-dim">Type above to search the catalog</div>
        </div>
      )}

      {data && (
        <div>
          {data.courses.length === 0 && data.lecturers.length === 0 && data.organizations.length === 0 ? (
            <div className="dark-panel" style={{ padding: 40, textAlign: "center", marginTop: 26 }}>
              <p className="muted">No results for “{q}”</p>
            </div>
          ) : (
            <>
              {data.lecturers.length > 0 && (
                <div className="mb-2">
                  {data.lecturers.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => router.push(`/lecturers/${l.slug}`)}
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-hover"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised text-sm font-bold text-accent">
                        {l.name.charAt(0)}
                      </span>
                      <span className="text-sm text-text">{l.name}</span>
                      <span className="ml-auto text-xs text-dim">Lecturer</span>
                    </button>
                  ))}
                </div>
              )}
              {data.organizations.map((o) => (
                <button
                  key={o.id}
                  onClick={() => router.push(`/organizations/${o.slug}`)}
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-hover"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised text-sm font-bold text-accent">
                    {o.name.charAt(0)}
                  </span>
                  <span className="text-sm text-text">{o.name}</span>
                  <span className="ml-auto text-xs text-dim">Channel</span>
                </button>
              ))}
              <div className="mt-2 flex flex-col gap-1">
                {data.courses.map((c) => (
                  <CourseRow key={c.id} course={c} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted">Loading…</div>}>
      <SearchInner />
    </Suspense>
  );
}
