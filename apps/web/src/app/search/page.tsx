"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, FileText, Mic, Search, Square, X } from "lucide-react";
import { get, post } from "@/lib/api";
import type { CourseSummary, ResourceSummary } from "@/lib/types";
import { CourseRow } from "@/components/CourseCard";
import { MobileHeader } from "@/components/Nav";
import { SkRows } from "@/components/Skeleton";
import { LoadError } from "@/components/LoadError";
import { CoverImage } from "@/components/CoverImage";
import { typeMeta } from "@/components/ResourceCard";

interface SearchData {
  query?: string;
  type?: SearchKind;
  total: number;
  courses: CourseSummary[];
  lecturers: { id: string; name: string; slug: string; photoUrl: string | null }[];
  organizations: { id: string; name: string; slug: string; logoUrl: string | null }[];
  resources: ResourceSummary[];
  trending: string[];
}

/**
 * The tabs above the results. `people` and `channels` are the catalogue's own
 * words for lecturers and organisations; the API accepts the model names too,
 * but these are what a reader recognises.
 */
type SearchKind = "all" | "courses" | "resources" | "people" | "channels";

const KINDS: { value: SearchKind; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "courses", label: "Courses" },
  { value: "resources", label: "Resources" },
  { value: "people", label: "People" },
  { value: "channels", label: "Channels" },
];

function isKind(value: string | null): value is SearchKind {
  return !!value && KINDS.some((k) => k.value === value);
}

/** Matches the API's default page size. */
const SEARCH_PAGE = 20;

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
        {/* Glyph or initial always; the picture lies over it. A hit whose avatar is
            blocked or slow then keeps its plate instead of going blank. */}
        {kind === "Channel" ? <Building2 size={15} /> : name.charAt(0).toUpperCase()}
        <CoverImage src={imageUrl} transform={{ width: 72, height: 72 }} />
      </span>
      <span className="s-hit__name">{name}</span>
      <span className="s-hit__kind">{kind}</span>
    </Link>
  );
}

/** A resource in the results — cover plate, title, type, reading time. */
function ResourceHit({ r }: { r: ResourceSummary }) {
  const meta = typeMeta(r.type);
  return (
    <Link href={`/resources/${r.slug}`} className="s-hit">
      <span className="s-hit__art s-hit__art--res">
        <FileText size={15} />
        <CoverImage src={r.coverUrl} transform={{ width: 72, height: 72 }} />
      </span>
      <span className="s-hit__name">{r.title}</span>
      <span className="s-hit__kind">
        {meta.label} · {r.readMinutes} min
      </span>
    </Link>
  );
}

function SearchInner() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [kind, setKind] = useState<SearchKind>(() => {
    const fromUrl = params.get("type");
    return isKind(fromUrl) ? fromUrl : "all";
  });
  const [data, setData] = useState<SearchData | null>(null);
  const [busy, setBusy] = useState(false);
  /* A failed search used to leave the previous query's hits on screen under the
     new text — the worst of the three outcomes, because it looks like an answer. */
  const [failed, setFailed] = useState(false);
  /* Retry has to change something the effect depends on. Re-setting `q` to its
     own value would not: React bails out of an identical state update. */
  const [retry, setRetry] = useState(0);
  const [trending, setTrending] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceUnsupported, setVoiceUnsupported] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
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
    setFailed(false);
    setMoreFailed(false);
    const query = q.trim();
    if (!query) {
      setData(null);
      setBusy(false);
      return;
    }
    // Busy flips the moment you type so the results area shows placeholder rows
    // instead of the previous query's hits — the old build left stale results on
    // screen for as long as the request took.
    setBusy(true);
    let cancelled = false;
    debounce.current = setTimeout(() => {
      get<SearchData>(`/search?q=${encodeURIComponent(query)}&type=${kind}&limit=${SEARCH_PAGE}&offset=0`)
        .then((d) => {
          if (cancelled) return;
          setData(d);
          setFailed(false);
        })
        .catch(() => {
          if (cancelled) return;
          setData(null);
          setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(debounce.current);
    };
  }, [q, retry, kind]);

  const loadMore = () => {
    if (!data || moreBusy) return;
    const query = q.trim();
    if (!query) return;
    const offset =
      kind === "resources"
        ? data.resources.length
        : kind === "people"
          ? data.lecturers.length
          : kind === "channels"
            ? data.organizations.length
            : data.courses.length;
    setMoreBusy(true);
    setMoreFailed(false);
    get<SearchData>(
      `/search?q=${encodeURIComponent(query)}&type=${kind}&limit=${SEARCH_PAGE}&offset=${offset}`,
    )
      .then((d) => {
        setData((prev) => {
          if (!prev) return d;
          // A late page from the previous query must not be appended to the
          // current one — the user may have typed while it was in flight.
          if (prev.query && d.query && prev.query !== d.query) return prev;
          if (prev.type !== d.type) return prev;
          return {
            ...prev,
            total: d.total,
            courses: prev.courses.concat(d.courses),
            resources: prev.resources.concat(d.resources),
            lecturers: prev.lecturers.concat(d.lecturers),
            organizations: prev.organizations.concat(d.organizations),
          };
        });
      })
      .catch(() => setMoreFailed(true))
      .finally(() => setMoreBusy(false));
  };

  /**
   * Record that this result was opened, so the ranking can learn that people
   * searching for this query choose this course. Fire-and-forget: the reader
   * is navigating, and a failed write must never be visible to them. The query
   * comes from `data`, not `q`, because debounced results can lag one keystroke
   * behind the box.
   */
  const recordClick = (courseId: string) => {
    const query = (data?.query ?? q).trim();
    if (query.length < 3) return;
    void post("/search/click", { query, courseId }).catch(() => undefined);
  };

  const empty =
    !!data &&
    data.courses.length === 0 &&
    data.resources.length === 0 &&
    data.lecturers.length === 0 &&
    data.organizations.length === 0;
  const entities = data ? data.lecturers.length + data.organizations.length : 0;

  return (
    <main className="page">
      <MobileHeader title="Search" />

      <span className="eyebrow">Search everything</span>
      <h1 className="display s-title">Find your next course.</h1>

      <div className="s-field">
        <Search size={16} className="s-field__icon" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search courses, resources, lecturers, channels"
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
      {q.trim().length >= 3 && (
        <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.8 }}>
          Want an answer rather than a list?{" "}
          <Link
            href={`/assistant?q=${encodeURIComponent(q.trim())}`}
            style={{ textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            Ask the assistant
          </Link>
        </p>
      )}

      {q.trim() && (
        <div className="pills s-filter" role="tablist" aria-label="Filter search results">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="tab"
              aria-selected={kind === k.value}
              className={`tab${kind === k.value ? " active" : ""}`}
              onClick={() => setKind(k.value)}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
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
          <p className="s-idle__hint">Search the whole catalogue — courses, resources, lecturers and channels.</p>
        </section>
      ) : busy && !data ? (
        <SkRows n={5} label="Searching" />
      ) : failed ? (
        <LoadError
          title="The search didn't come back"
          body="Nothing to do with your query — the request to our servers failed. Try it again."
          onRetry={() => setRetry((n) => n + 1)}
          compact
        />
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
            {(kind === "all" || kind === "people" || kind === "channels") && entities > 0 && (
              <section className="s-group">
                <h2 className="s-group__head">
                  {kind === "people" ? "People" : kind === "channels" ? "Channels" : "People & channels"}
                  {kind !== "all" && <span className="s-group__n mono">{data.total}</span>}
                </h2>
                <div className="dark-panel s-hits">
                  {(kind === "all" || kind === "people") &&
                    data.lecturers.map((l) => (
                      <EntityHit key={l.id} href={`/lecturers/${l.slug}`} name={l.name} imageUrl={l.photoUrl} kind="Lecturer" />
                    ))}
                  {(kind === "all" || kind === "channels") &&
                    data.organizations.map((o) => (
                      <EntityHit key={o.id} href={`/organizations/${o.slug}`} name={o.name} imageUrl={o.logoUrl} kind="Channel" />
                    ))}
                </div>
                {kind !== "all" && (
                  <div className="s-more">
                    {moreFailed && (
                      <span className="s-more__note">Couldn’t load the next page — check your connection.</span>
                    )}
                    {entities < data.total ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={loadMore}
                        disabled={moreBusy}
                        style={{ minHeight: 40 }}
                      >
                        {moreBusy
                          ? "Loading…"
                          : `Load ${Math.min(SEARCH_PAGE, data.total - entities)} more · ${data.total - entities} left`}
                      </button>
                    ) : (
                      <span className="s-more__note">
                        {data.total === 1 ? "The only match." : `All ${data.total} matches shown.`}
                      </span>
                    )}
                  </div>
                )}
              </section>
            )}

            {(kind === "all" || kind === "resources") && data.resources.length > 0 && (
              <section className="s-group">
                <h2 className="s-group__head">
                  Resources{" "}
                  <span className="s-group__n mono">
                    {kind === "resources" ? data.total : data.resources.length}
                  </span>
                </h2>
                <div className="dark-panel s-hits">
                  {data.resources.map((r) => (
                    <ResourceHit key={r.id} r={r} />
                  ))}
                </div>
                {kind === "resources" && (
                  <div className="s-more">
                    {moreFailed && (
                      <span className="s-more__note">Couldn’t load the next page — check your connection.</span>
                    )}
                    {data.resources.length < data.total ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={loadMore}
                        disabled={moreBusy}
                        style={{ minHeight: 40 }}
                      >
                        {moreBusy
                          ? "Loading…"
                          : `Load ${Math.min(SEARCH_PAGE, data.total - data.resources.length)} more · ${data.total - data.resources.length} left`}
                      </button>
                    ) : (
                      <span className="s-more__note">
                        {data.total === 1 ? "The only match." : `All ${data.total} matches shown.`}
                      </span>
                    )}
                  </div>
                )}
              </section>
            )}

            {(kind === "all" || kind === "courses") && data.courses.length > 0 && (
              <section className="s-group">
                <h2 className="s-group__head">
                  Courses <span className="s-group__n mono">{data.total}</span>
                </h2>
                <div className="flex flex-col gap-1">
                  {data.courses.map((c) => (
                    <CourseRow key={c.id} course={c} onOpen={() => recordClick(c.id)} />
                  ))}
                </div>
                <div className="s-more">
                  {moreFailed && (
                    <span className="s-more__note">Couldn’t load the next page — check your connection.</span>
                  )}
                  {data.courses.length < data.total ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={loadMore}
                      disabled={moreBusy}
                      style={{ minHeight: 40 }}
                    >
                      {moreBusy
                        ? "Loading…"
                        : `Load ${Math.min(SEARCH_PAGE, data.total - data.courses.length)} more · ${data.total - data.courses.length} left`}
                    </button>
                  ) : (
                    <span className="s-more__note">
                      {data.total === 1 ? "The only match." : `All ${data.total} matches shown.`}
                    </span>
                  )}
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
