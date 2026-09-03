"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, Mic, Search, Square, X } from "lucide-react";
import { get } from "@/lib/api";
import type { CourseSummary } from "@/lib/types";
import { CourseRow } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";
import { SkRows } from "@/components/Skeleton";
import { cloudinaryUrl } from "@/lib/cloudinary";

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

/** A person or a channel in the results — one row, one destination. */
function EntityHit({
  href,
  name,
  imageUrl,
  kind,
}: {
  href: string;
  name: string;
  imageUrl: string | null;
  kind: string;
}) {
  return (
    <Link href={href} className="s-hit">
      <span className={`s-hit__art ${kind === "Channel" ? "s-hit__art--org" : ""}`}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cloudinaryUrl(imageUrl, { width: 72, height: 72 }) ?? undefined} alt="" loading="lazy" />
        ) : kind === "Channel" ? (
          <Building2 size={15} />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </span>
      <span className="s-hit__name">{name}</span>
      <span className="s-hit__kind">{kind}</span>
    </Link>
  );
}

function SearchInner() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [data, setData] = useState<SearchData | null>(null);
  const [busy, setBusy] = useState(false);
  const [trending, setTrending] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceUnsupported, setVoiceUnsupported] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Holding the live recogniser matters: the stop path used to build a second
  // instance and stop *that*, so the microphone stayed open and the button
  // never actually turned off.
  const rec = useRef<SpeechRecognitionLike | null>(null);

  const toggleVoice = () => {
    if (listening) {
      rec.current?.stop();
      setListening(false);
      return;
    }
    const next = getSpeechRecognition();
    if (!next) {
      setVoiceUnsupported(true);
      setTimeout(() => setVoiceUnsupported(false), 2500);
      return;
    }
    rec.current = next;
    next.lang = "en-US";
    next.interimResults = false;
    next.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) setQ(transcript.trim());
    };
    next.onend = () => setListening(false);
    next.onerror = () => setListening(false);
    setListening(true);
    next.start();
  };

  useEffect(() => () => rec.current?.stop(), []);

  useEffect(() => {
    get<{ trending: string[] }>("/search/trending")
      .then((d) => setTrending(d.trending))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!q.trim()) {
      setData(null);
      setBusy(false);
      return;
    }
    // Busy flips the moment you type so the results area shows placeholder rows
    // instead of the previous query's hits — the old build left stale results on
    // screen for as long as the request took.
    setBusy(true);
    debounce.current = setTimeout(() => {
      get<SearchData>(`/search?q=${encodeURIComponent(q)}`)
        .then(setData)
        .catch(() => undefined)
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [q]);

  const empty =
    !!data && data.courses.length === 0 && data.lecturers.length === 0 && data.organizations.length === 0;
  const entities = data ? data.lecturers.length + data.organizations.length : 0;

  return (
    <main className="page">
      <MobileHeader title="Search" />

      <span className="eyebrow">Course search</span>
      <h1 className="display s-title">Find your next course.</h1>

      <div className="s-field">
        <Search size={16} className="s-field__icon" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by course, lecturer, or topic"
          aria-label="Search the catalogue"
          enterKeyHint="search"
        />
        {q && (
          <button type="button" className="s-field__btn" onClick={() => setQ("")} aria-label="Clear search">
            <X size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={toggleVoice}
          className={`s-field__btn ${listening ? "is-on" : ""}`}
          aria-pressed={listening}
          aria-label={listening ? "Stop voice search" : "Search by voice"}
        >
          {listening ? <Square size={13} fill="currentColor" /> : <Mic size={15} />}
        </button>
      </div>

      <div className="s-note" role="status">
        {listening ? "Listening — speak now" : ""}
        {voiceUnsupported ? "Voice search needs Chrome or Edge." : ""}
      </div>
      {!q.trim() ? (
        <section className="s-idle">
          {trending.length > 0 && (
            <>
              <span className="eyebrow">Everyone searching</span>
              <div className="pills" style={{ marginTop: 12 }}>
                {trending.map((t) => (
                  <button key={t} type="button" className="badge" onClick={() => setQ(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="s-idle__hint">Search the whole catalogue — courses, lecturers and channels.</p>
        </section>
      ) : busy && !data ? (
        <SkRows n={5} label="Searching" />
      ) : empty ? (
        <div className="empty-state s-empty">
          <div className="empty-icon">🔍</div>
          <h3 style={{ margin: "0 0 6px" }}>Nothing matches “{q.trim()}”</h3>
          <p style={{ margin: 0 }}>Try a shorter phrase, or browse by topic instead.</p>
          <Link href="/browse" className="btn" style={{ marginTop: 18 }}>
            Browse the catalogue
          </Link>
        </div>
      ) : (
        data && (
          <div className={busy ? "s-results is-stale" : "s-results"}>
            {entities > 0 && (
              <section className="s-group">
                <h2 className="s-group__head">People &amp; channels</h2>
                <div className="dark-panel s-hits">
                  {data.lecturers.map((l) => (
                    <EntityHit key={l.id} href={`/lecturers/${l.slug}`} name={l.name} imageUrl={l.photoUrl} kind="Lecturer" />
                  ))}
                  {data.organizations.map((o) => (
                    <EntityHit key={o.id} href={`/organizations/${o.slug}`} name={o.name} imageUrl={o.logoUrl} kind="Channel" />
                  ))}
                </div>
              </section>
            )}

            {data.courses.length > 0 && (
              <section className="s-group">
                <h2 className="s-group__head">
                  Courses <span className="s-group__n mono">{data.total}</span>
                </h2>
                <div className="flex flex-col gap-1">
                  {data.courses.map((c) => (
                    <CourseRow key={c.id} course={c} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <SkRows n={5} label="Opening search" />
        </main>
      }
    >
      <SearchInner />
    </Suspense>
  );
}
