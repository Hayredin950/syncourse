"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  Maximize2,
  Paperclip,
  Share2,
  X,
} from "lucide-react";
import { get, post } from "@/lib/api";
import type { ResourceDetail, ResourceMedia } from "@/lib/types";
import { Markdown, markdownHeadings } from "@/components/Markdown";
import { MobileHeader } from "@/components/Nav";
import { attachmentUrl, cloudinaryUrl } from "@/lib/cloudinary";
import { compact, formatDate } from "@/lib/format";
import { ResourceCard, mediaMeta, resourceTint, typeMeta } from "@/components/ResourceCard";
import { useToast } from "@/lib/useToast";

/**
 * A resource, in full.
 *
 * Nothing here is behind a Telegram deep link: a cheat-sheet is small enough to
 * publish outright, so the page shows the images at full size, plays the video,
 * reads the PDF inline and renders the markdown body — and only then offers the
 * files for keeping. The whole view is driven by a slug prop so the static route
 * and the smart 404 can both render it.
 */

/** Kinds with no inline viewer — they get a row in the files panel and nothing else. */
const PLAIN_KINDS = ["doc", "sheet", "slide", "archive", "code", "other"];

export default function ResourcePageClient() {
  const { slug } = useParams<{ slug: string }>();
  return <ResourceDetailView slug={slug ?? ""} />;
}

export function ResourceDetailView({ slug }: { slug: string }) {
  const [r, setR] = useState<ResourceDetail | null>(null);
  const [error, setError] = useState(false);
  const [shot, setShot] = useState<number | null>(null);
  const { toast, setToast } = useToast();

  useEffect(() => {
    if (!slug) return;
    get<ResourceDetail>(`/resources/${slug}`)
      .then(setR)
      .catch(() => setError(true));
  }, [slug]);

  const media = r?.media ?? [];
  const images = useMemo(() => media.filter((m) => m.kind === "image" && m.url), [media]);
  const videos = useMemo(() => media.filter((m) => m.kind === "video" && m.url), [media]);
  const audio = useMemo(() => media.filter((m) => m.kind === "audio" && m.url), [media]);
  const pdfs = useMemo(() => media.filter((m) => m.kind === "pdf" && m.url), [media]);
  const links = useMemo(() => media.filter((m) => m.kind === "link" && m.url), [media]);
  // Files with no viewer above come first: the panel is the only place they
  // appear, where an image or a PDF has already been shown in full.
  const keepable = useMemo(() => {
    const items = media.filter((m) => m.kind !== "link" && m.url);
    return [
      ...items.filter((m) => PLAIN_KINDS.includes(m.kind)),
      ...items.filter((m) => !PLAIN_KINDS.includes(m.kind)),
    ];
  }, [media]);
  const toc = useMemo(
    () => markdownHeadings(r?.bodyMd).filter((h) => h.depth <= 2),
    [r?.bodyMd],
  );

  const flash = useCallback(
    (msg: string) => {
      setToast(msg);
      setTimeout(() => setToast(""), 2200);
    },
    [setToast],
  );

  /** Views and downloads are counted apart, so "opened" and "kept" stay distinct. */
  const noteDownload = useCallback(() => {
    void post(`/resources/${slug}/download`).catch(() => undefined);
  }, [slug]);

  const onShare = () => {
    if (navigator.share) {
      void navigator.share({ title: r?.title, url: window.location.href });
      return;
    }
    void navigator.clipboard?.writeText(window.location.href);
    flash("Link copied");
  };

  // Arrow keys and Escape in the lightbox — a gallery you can only click is a
  // gallery nobody looks past the second image of.
  useEffect(() => {
    if (shot === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShot(null);
      if (e.key === "ArrowRight") setShot((i) => (i === null ? i : (i + 1) % images.length));
      if (e.key === "ArrowLeft") setShot((i) => (i === null ? i : (i - 1 + images.length) % images.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shot, images.length]);

  if (error || !r) {
    return (
      <main className="page">
        <MobileHeader title="Resource" />
        <Link href="/resources" className="res-back">
          <ArrowLeft size={13} /> Resources
        </Link>
        <div className="dark-panel res-empty">
          {error ? (
            <>
              <h3>This resource is not here.</h3>
              <p className="muted">It may have been unpublished, or the link is wrong.</p>
              <Link className="btn" href="/resources">
                Back to the library
              </Link>
            </>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </div>
      </main>
    );
  }

  const meta = typeMeta(r.type);
  const Glyph = meta.icon;
  const updated = formatDate(r.updatedAt) !== formatDate(r.publishedAt);
  const nothingPublished = !r.bodyMd.trim() && media.length === 0;

  return (
    <main className="page res-detail">
      <MobileHeader title={meta.label} />
      <Link href="/resources" className="res-back">
        <ArrowLeft size={13} /> Resources
      </Link>

      <header className="res-hero" style={resourceTint(r.slug)}>
        {r.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="res-hero__wash" src={cloudinaryUrl(r.coverUrl, { width: 1200, height: 600 }) ?? undefined} alt="" />
        )}
        <div className="res-hero__inner">
          <span className="res-kicker">
            <Glyph size={12} /> {meta.label}
            {r.category && (
              <>
                <i>·</i>
                <Link href={`/resources?category=${r.category.slug}`}>
                  {r.category.icon ? `${r.category.icon} ` : ""}
                  {r.category.name}
                </Link>
              </>
            )}
            {r.isPremium && <span className="badge primary res-kicker__badge">Premium</span>}
          </span>
          <h1 className="display res-hero__title">{r.title}</h1>
          {r.summary && <p className="res-hero__lede">{r.summary}</p>}
          <div className="res-meta mono">
            <span>
              <Clock3 size={12} /> {r.readMinutes} min read
            </span>
            {media.length > 0 && (
              <span>
                <Paperclip size={12} /> {media.length} file{media.length === 1 ? "" : "s"}
              </span>
            )}
            <span>
              <Eye size={12} /> {compact(r.viewCount)} views
            </span>
            {r.downloadCount > 0 && (
              <span>
                <Download size={12} /> {compact(r.downloadCount)} downloads
              </span>
            )}
            <span>{updated ? `Updated ${formatDate(r.updatedAt)}` : formatDate(r.publishedAt)}</span>
          </div>
          <div className="res-actions">
            {keepable.length > 0 && (
              <a className="btn primary" href="#files">
                <Download size={14} /> Get the files ({keepable.length})
              </a>
            )}
            {r.sourceUrl && (
              <a className="btn" href={r.sourceUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> View the original
              </a>
            )}
            <button type="button" className="btn ghost" onClick={onShare}>
              <Share2 size={14} /> Share
            </button>
          </div>
        </div>
      </header>

      <div className="res-columns">
        <article className="res-main">
          {nothingPublished && (
            <div className="dark-panel res-empty">
              <h3>Nothing published here yet.</h3>
              <p className="muted">
                This {meta.label.toLowerCase()} has no body and no files attached — an editor still has to fill
                it in.
              </p>
            </div>
          )}

          {images.length > 0 && (
            <section className="res-block">
              <div className="res-block__head">
                <h2>
                  {images.length === 1 ? "The sheet" : `${images.length} sheets`}
                </h2>
                <span className="muted mono res-block__hint">Click to enlarge</span>
              </div>
              <div className={`res-gallery ${images.length === 1 ? "res-gallery--one" : ""}`}>
                {images.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    className="res-shot"
                    onClick={() => setShot(i)}
                    aria-label={`Enlarge ${m.fileName ?? `image ${i + 1}`}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cloudinaryUrl(m.url, { width: 1000 }) ?? undefined} alt={m.caption ?? m.fileName ?? ""} />
                    <span className="res-shot__zoom">
                      <Maximize2 size={13} />
                    </span>
                    {m.caption && <span className="res-shot__caption">{m.caption}</span>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {videos.map((m) => (
            <section className="res-block" key={m.id}>
              <div className="res-block__head">
                <h2>{m.fileName ?? "Video"}</h2>
              </div>
              {/* Controls only — autoplay on a reference page is hostile. */}
              <video className="res-player" src={m.url ?? undefined} controls preload="metadata" />
              {m.caption && <p className="res-cap">{m.caption}</p>}
            </section>
          ))}

          {audio.length > 0 && (
            <section className="res-block">
              <div className="res-block__head">
                <h2>Audio</h2>
              </div>
              <div className="res-audio-list">
                {audio.map((m) => (
                  <div className="res-audio" key={m.id}>
                    <span className="res-audio__name">{m.fileName ?? "Recording"}</span>
                    <audio src={m.url ?? undefined} controls preload="none" />
                    {m.caption && <span className="res-cap">{m.caption}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {r.bodyMd.trim() && (
            <section className="res-block" id="read">
              <Markdown text={r.bodyMd} anchors className="md--doc res-body" />
            </section>
          )}

          {pdfs.length > 0 && (
            <section className="res-block" id="documents">
              <div className="res-block__head">
                <h2>{pdfs.length === 1 ? "Document" : `${pdfs.length} documents`}</h2>
                <span className="muted mono res-block__hint">Read here or take it with you</span>
              </div>
              <div className="res-pdf-list">
                {pdfs.map((m) => (
                  <PdfReader key={m.id} item={m} onDownload={noteDownload} />
                ))}
              </div>
            </section>
          )}

          {keepable.length > 0 && (
            <section className="res-block" id="files">
              <div className="res-block__head">
                <h2>Files</h2>
                <span className="muted mono res-block__hint">
                  {keepable.length} item{keepable.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="files-panel">
                <p className="files-note">
                  Everything attached to this {meta.label.toLowerCase()}, ready to keep. Downloads are served
                  straight from storage — <strong>no Telegram needed</strong>.
                </p>
                <div className="file-rows">
                  {keepable.map((m) => (
                    <FileRow key={m.id} item={m} onDownload={noteDownload} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {links.length > 0 && (
            <section className="res-block">
              <div className="res-block__head">
                <h2>Links</h2>
              </div>
              <div className="files-panel">
                <div className="file-rows" style={{ paddingTop: 12 }}>
                  {links.map((m) => (
                    <a
                      key={m.id}
                      className="file-row"
                      href={m.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="file-row__num">
                        <ExternalLink size={13} />
                      </span>
                      <span className="file-row__body">
                        <span className="file-row__name">{m.fileName ?? m.url}</span>
                        <span className="file-row__meta mono">{m.caption ?? "External link"}</span>
                      </span>
                      <ChevronRight size={14} className="muted" />
                    </a>
                  ))}
                </div>
              </div>
            </section>
          )}
        </article>

        <aside className="res-aside">
          <div className="dark-panel res-panel">
            <span className="eyebrow">At a glance</span>
            <dl className="res-facts">
              <dt>Type</dt>
              <dd>{meta.label}</dd>
              {r.category && (
                <>
                  <dt>Category</dt>
                  <dd>
                    <Link href={`/resources?category=${r.category.slug}`}>{r.category.name}</Link>
                  </dd>
                </>
              )}
              {r.organization && (
                <>
                  <dt>Publisher</dt>
                  <dd>
                    <Link href={`/publishers/${r.organization.slug}`}>{r.organization.name}</Link>
                  </dd>
                </>
              )}
              {r.lecturer && (
                <>
                  <dt>Author</dt>
                  <dd>
                    <Link href={`/lecturers/${r.lecturer.slug}`}>{r.lecturer.name}</Link>
                  </dd>
                </>
              )}
              <dt>Reading time</dt>
              <dd>{r.readMinutes} min</dd>
              <dt>Published</dt>
              <dd>{formatDate(r.publishedAt)}</dd>
              {updated && (
                <>
                  <dt>Updated</dt>
                  <dd>{formatDate(r.updatedAt)}</dd>
                </>
              )}
              {media.length > 0 && (
                <>
                  <dt>Attached</dt>
                  <dd>{media.length} file{media.length === 1 ? "" : "s"}</dd>
                </>
              )}
            </dl>
          </div>

          {toc.length > 1 && (
            <nav className="dark-panel res-panel res-toc" aria-label="On this page">
              <span className="eyebrow">On this page</span>
              <ul>
                {toc.map((h) => (
                  <li key={h.id} className={h.depth > 1 ? "res-toc__sub" : undefined}>
                    <a href={`#${h.id}`}>{h.text}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {r.tags.length > 0 && (
            <div className="dark-panel res-panel">
              <span className="eyebrow">Tags</span>
              <div className="pills res-tags">
                {r.tags.map((t) => (
                  <Link key={t} href={`/resources?tag=${encodeURIComponent(t)}`} className="badge">
                    {t}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {r.related.length > 0 && (
        <section className="rail">
          <div className="section-head">
            <h2>More like this</h2>
            <Link href={r.category ? `/resources?category=${r.category.slug}` : "/resources"}>
              See all <ChevronRight size={14} style={{ verticalAlign: "middle" }} />
            </Link>
          </div>
          <div className="res-grid">
            {r.related.map((x) => (
              <ResourceCard key={x.id} resource={x} />
            ))}
          </div>
        </section>
      )}

      {shot !== null && images[shot] && (
        <div className="res-lightbox" onClick={() => setShot(null)} role="dialog" aria-modal="true">
          <button type="button" className="res-lightbox__close" aria-label="Close">
            <X size={18} />
          </button>
          {images.length > 1 && (
            <button
              type="button"
              className="res-lightbox__nav res-lightbox__nav--prev"
              aria-label="Previous image"
              onClick={(e) => {
                e.stopPropagation();
                setShot((i) => (i === null ? i : (i - 1 + images.length) % images.length));
              }}
            >
              <ChevronLeft size={22} />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[shot].url ?? undefined}
            alt={images[shot].caption ?? ""}
            onClick={(e) => e.stopPropagation()}
          />
          {images.length > 1 && (
            <button
              type="button"
              className="res-lightbox__nav res-lightbox__nav--next"
              aria-label="Next image"
              onClick={(e) => {
                e.stopPropagation();
                setShot((i) => (i === null ? i : (i + 1) % images.length));
              }}
            >
              <ChevronRight size={22} />
            </button>
          )}
          <div className="res-lightbox__foot" onClick={(e) => e.stopPropagation()}>
            <span className="mono">
              {images.length > 1 ? `${shot + 1} / ${images.length}` : ""}
              {images[shot].caption ? ` · ${images[shot].caption}` : ""}
            </span>
            <a
              className="btn primary file-btn"
              href={attachmentUrl(images[shot].url) ?? "#"}
              target="_blank"
              rel="noreferrer"
              onClick={noteDownload}
            >
              <Download size={13} /> Download
            </a>
          </div>
        </div>
      )}

      {toast && <div className="res-toast">{toast}</div>}
    </main>
  );
}

/**
 * An inline PDF, mounted on demand.
 *
 * One iframe per document would pull every file down on page load, so the reader
 * only appears when asked for. A host that refuses to be framed — or that sends
 * `Content-Disposition: attachment` — renders an empty frame, which is why "Tab"
 * sits beside it rather than behind a menu.
 */
function PdfReader({ item, onDownload }: { item: ResourceMedia; onDownload: () => void }) {
  const [open, setOpen] = useState(false);
  const Icon = mediaMeta(item.kind).icon;
  return (
    <div className="res-pdf">
      <div className="res-pdf__head">
        <span className="file-row__num">
          <Icon size={13} />
        </span>
        <span className="file-row__body">
          <span className="file-row__name">{item.fileName ?? "Document.pdf"}</span>
          <span className="file-row__meta mono">
            PDF
            {item.fileSizeMb ? ` · ${item.fileSizeMb} MB` : ""}
            {item.caption ? ` · ${item.caption}` : ""}
          </span>
        </span>
        <button type="button" className="btn ghost file-btn" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Read here"}
        </button>
        <a className="btn ghost file-btn" href={item.url ?? "#"} target="_blank" rel="noreferrer">
          <ExternalLink size={12} /> Tab
        </a>
        <a
          className="btn primary file-btn"
          href={attachmentUrl(item.url) ?? "#"}
          target="_blank"
          rel="noreferrer"
          onClick={onDownload}
        >
          <Download size={12} /> Save
        </a>
      </div>
      {open && (
        <div className="res-pdf__frame">
          <iframe src={`${item.url}#view=FitH`} title={item.fileName ?? "PDF"} loading="lazy" />
        </div>
      )}
    </div>
  );
}

/** One attachment, ready to keep — shares the course-files row styling. */
function FileRow({ item, onDownload }: { item: ResourceMedia; onDownload: () => void }) {
  const m = mediaMeta(item.kind);
  const Icon = m.icon;
  return (
    <div className="file-row">
      <span className="file-row__num">
        <Icon size={13} />
      </span>
      <span className="file-row__body">
        <span className="file-row__name">{item.fileName ?? m.label}</span>
        <span className="file-row__meta mono">
          {m.label}
          {item.fileSizeMb ? ` · ${item.fileSizeMb} MB` : ""}
          {item.caption ? ` · ${item.caption}` : ""}
        </span>
      </span>
      <a
        className="btn primary file-btn"
        href={attachmentUrl(item.url) ?? "#"}
        target="_blank"
        rel="noreferrer"
        onClick={onDownload}
      >
        <Download size={13} /> Download
      </a>
    </div>
  );
}
