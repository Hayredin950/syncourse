"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { get } from "@/lib/api";
import type { CourseSummary } from "@/lib/types";
import { CourseRow } from "@/components/CourseCard";

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

export default function SearchPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
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
    <div className="pb-6">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search courses, lecturers…"
            className="w-full flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-dim focus:border-accent focus:outline-none"
          />
          <button
            onClick={toggleVoice}
            title="Voice search"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-base ${
              listening
                ? "border-accent bg-accent text-black"
                : "border-border bg-surface text-muted hover:text-text"
            }`}
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
      </div>

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
        <div className="px-3 pt-2">
          {data.courses.length === 0 && data.lecturers.length === 0 && data.organizations.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted">No results for “{q}”</div>
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
    </div>
  );
}
