"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, Eye, LayoutGrid, Paperclip } from "lucide-react";
import { get } from "@/lib/api";
import type { ResourceList, ResourceSummary } from "@/lib/types";
import { compact, plural } from "@/lib/format";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { ResourceCard, ResourceFeature, resourceTint, typeMeta } from "@/components/ResourceCard";

/**
 * The reading shelf on the home page — cheat-sheets, roadmaps and notes.
 *
 * These are not courses and a poster rail would lie about them: what matters is
 * what a thing is, how long it takes and what came attached. So: one spotlight
 * with room for its summary, the rest as landscape tiles, and a tab strip that
 * says out loud how much of each kind exists. The counts come from the library
 * as a whole rather than the eight rows fetched here, so "Roadmaps 1" means the
 * site holds one roadmap — not that one turned up in this slice.
 *
 * Filtering is local. Everything needed is already in memory, and a tab that
 * refetched would flash a skeleton to move between three cards.
 */
const TYPE_ORDER = ["cheat-sheet", "roadmap", "note"];
const TAKE = 9;

export function HomeResources() {
  const [data, setData] = useState<ResourceList | null>(null);
  const [type, setType] = useState("");

  useEffect(() => {
    get<ResourceList>(`/resources?sort=newest&limit=${TAKE}`)
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const counts = data?.counts ?? {};
  const libraryTotal = useMemo(
    () => Object.values(counts).reduce((a, b) => a + b, 0),
    [counts],
  );

  const shown = useMemo(
    () => (data ? data.results.filter((r) => !type || r.type === type) : []),
    [data, type],
  );

  // Nothing published yet: the band would be an empty promise, so it is not
  // rendered at all rather than shipped as an empty state on the home page.
  if (!data || data.results.length === 0) return null;

  const [lead, ...rest] = shown;
  // Either a full 2×2 block of tiles beside a tall spotlight, or a single row
  // beside a short one. Both fill the grid exactly; anything between the two
  // leaves holes in the band, which reads as something failing to load.
  const tall = rest.length >= 4;
  const cards = tall ? rest.slice(0, 4) : rest.slice(0, 2);

  return (
    <section className="home-res">
      <div className="home-res__head">
        <div>
          <span className="eyebrow">Resource library</span>
          <h2 className="home-res__title">Cheat-sheets, roadmaps &amp; notes</h2>
          <p className="muted home-res__lede">
            The short things you keep open in a second tab. Every one is published in full here — read it on the
            page, then take the files with you.
          </p>
        </div>
        <Link href="/resources" className="btn primary home-res__cta">
          Open the library <ArrowRight size={13} />
        </Link>
      </div>

      <div className="res-tabs home-res__tabs" role="tablist" aria-label="Resource type">
        <button
          type="button"
          role="tab"
          aria-selected={!type}
          className={`res-tab ${type ? "" : "active"}`}
          onClick={() => setType("")}
        >
          <LayoutGrid size={13} /> All
          {libraryTotal > 0 && <b>{libraryTotal}</b>}
        </button>
        {TYPE_ORDER.filter((t) => counts[t]).map((t) => {
          const meta = typeMeta(t);
          const Icon = meta.icon;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={type === t}
              className={`res-tab ${type === t ? "active" : ""}`}
              onClick={() => setType(type === t ? "" : t)}
            >
              <Icon size={13} /> {meta.plural}
              <b>{counts[t]}</b>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="home-res__none">
          The newest {TAKE} resources hold no {typeMeta(type).plural.toLowerCase()} —{" "}
          <Link href={`/resources?type=${type}`}>see all {counts[type]} in the library</Link>.
        </p>
      ) : cards.length === 0 ? (
        // One of a kind: the wide index card says more about it than a lone tile
        // marooned in a four-column grid.
        <ResourceFeature resource={lead} />
      ) : (
        <div className={`home-res__grid ${tall ? "home-res__grid--tall" : ""}`}>
          <Spotlight resource={lead} />
          {cards.map((r) => (
            <ResourceCard key={r.id} resource={r} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The lead tile. `ResourceFeature` on the index puts its art in a 150px column;
 * here the spotlight is twice as wide as a card, so the art goes on top and the
 * summary gets the room it was written for.
 */
function Spotlight({ resource: r }: { resource: ResourceSummary }) {
  const meta = typeMeta(r.type);
  const Glyph = meta.icon;
  return (
    <Link href={`/resources/${r.slug}`} className="home-res__lead">
      <span className="home-res__art" style={resourceTint(r.slug)}>
        {/* Placeholder underneath rather than instead of: a cover that is slow,
            blocked or gone then leaves the tint and the glyph on show. This tile
            is the widest crop of the lot — 16:8.2 out of a portrait page — so it
            also takes the top of the document, where the heading is. */}
        <Glyph className="res-card__glyph" size={52} strokeWidth={1.3} />
        {r.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cloudinaryUrl(r.coverUrl, { width: 900, height: 560, gravity: "north" }) ?? undefined} alt="" />
        )}
        <span className="home-res__kicker">
          <Glyph size={11} /> {meta.label}
        </span>
        {r.isPremium && <span className="res-card__premium">Premium</span>}
      </span>
      <span className="home-res__leadbody">
        <strong className="home-res__leadtitle">{r.title}</strong>
        {r.summary && <span className="home-res__leadexcerpt">{r.summary}</span>}
        <span className="home-res__leadmeta mono">
          <span>
            <Clock3 size={10} /> {r.readMinutes} min read
          </span>
          {r.mediaCount > 0 && (
            <span>
              <Paperclip size={10} /> {plural(r.mediaCount, "file")}
            </span>
          )}
          <span>
            <Eye size={10} /> {compact(r.viewCount)}
          </span>
          {r.category && <span className="home-res__leadcat">{r.category.name}</span>}
        </span>
      </span>
    </Link>
  );
}
