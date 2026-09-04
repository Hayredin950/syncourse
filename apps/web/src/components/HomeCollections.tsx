"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bookmark, Layers, Plus } from "lucide-react";
import { get } from "@/lib/api";
import { cloudinaryUrl } from "@/lib/cloudinary";
import type { CollectionSummary } from "@/lib/types";

/**
 * Community shelves on the home page.
 *
 * The rails above this band are the catalogue talking about itself — what is
 * new, what is popular. This one is other learners talking: someone sat down,
 * picked six courses that belong together and named the pile. That is a
 * different kind of recommendation and it earns its own panel rather than a
 * seventh poster rail.
 *
 * Fetched here rather than folded into `/home`: the payload is already large,
 * and a band that fails to load should cost the page nothing.
 */
const TAKE = 8;

export function HomeCollections() {
  const [lists, setLists] = useState<CollectionSummary[] | null>(null);

  useEffect(() => {
    get<{ results: CollectionSummary[] }>(`/lists?sort=most-saved&limit=${TAKE}`)
      // Empty shelves are dropped, not shown: "0 courses" on the home page is an
      // invitation to click through to nothing.
      .then((r) => setLists(r.results.filter((l) => l.itemCount > 0)))
      .catch(() => setLists([]));
  }, []);

  // Nothing public and populated yet — the band would promise something the site
  // cannot show, so it is not rendered at all.
  if (!lists || lists.length === 0) return null;

  return (
    <section className="home-col">
      <div className="home-col__head">
        <div>
          <span className="eyebrow">Community shelves</span>
          <h2 className="home-col__title">Collections worth borrowing</h2>
          <p className="muted home-col__lede">
            Courses someone else already grouped for a reason — a stack for a language, a term, a job they were
            studying toward. Save a shelf and it follows you.
          </p>
        </div>
        <Link href="/lists" className="btn primary home-col__cta">
          All collections <ArrowRight size={13} />
        </Link>
      </div>

      <div className="home-col__grid">
        {lists.map((l) => (
          <CollectionCard key={l.id} list={l} />
        ))}
        <Link href="/lists" className="col-cta">
          <Plus size={17} className="rating" />
          <strong>Build your own shelf</strong>
          <span>Group the courses you keep coming back to, then keep it private or share it.</span>
          <em>Start a collection</em>
        </Link>
      </div>
    </section>
  );
}

/**
 * Covers are laid side by side as a spine strip rather than stacked into one
 * hero image: a collection is plural, and three slivers of three different
 * covers say that faster than any label does.
 */
function CollectionCard({ list: l }: { list: CollectionSummary }) {
  const covers = l.covers.slice(0, 3);
  return (
    <Link href={`/lists/detail?id=${l.id}`} className="col-card">
      <span className="col-card__strip">
        {covers.length > 0 ? (
          covers.map((c, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={cloudinaryUrl(c, { width: 220, height: 300 }) ?? undefined} alt="" loading="lazy" />
          ))
        ) : (
          <span className="col-card__blank" />
        )}
        <span className="col-card__count">
          <Layers size={9} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
          {l.itemCount}
        </span>
      </span>
      <span className="col-card__body">
        <strong className="col-card__name">{l.name}</strong>
        {l.description && <span className="col-card__desc">{l.description}</span>}
        <span className="col-card__foot">
          <span className="col-card__by">by {l.ownerName ?? "a learner"}</span>
          <span className="col-card__saves">
            <Bookmark size={10} /> {l.savesCount}
          </span>
        </span>
      </span>
    </Link>
  );
}
