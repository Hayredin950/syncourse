"use client";

import Link from "next/link";
import {
  Archive,
  BookOpen,
  Clock3,
  Code2,
  Eye,
  FileSpreadsheet,
  FileText,
  Film,
  Headphones,
  ImageIcon,
  Link2,
  Map,
  Paperclip,
  Presentation,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import type { ResourceMediaKind, ResourceSummary } from "@/lib/types";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { compact, plural } from "@/lib/format";
import { hueFromString } from "@/components/CourseCard";

/**
 * Resource presentation, shared by the index, the detail page and the rails.
 *
 * A resource is a document, not a course, so it gets a landscape card instead of
 * a 2:3 poster: the useful signal is "what is it, how long is it, what came with
 * it" rather than cover art, and most of these arrive with no cover at all.
 */

/** Labels and glyphs per resource type — the plural is for tabs and counts. */
export const RESOURCE_TYPE_META: Record<string, { label: string; plural: string; icon: LucideIcon }> = {
  "cheat-sheet": { label: "Cheat-sheet", plural: "Cheat-sheets", icon: FileText },
  roadmap: { label: "Roadmap", plural: "Roadmaps", icon: Map },
  note: { label: "Useful note", plural: "Useful notes", icon: StickyNote },
};

export const typeMeta = (type: string) =>
  RESOURCE_TYPE_META[type] ?? { label: type, plural: type, icon: BookOpen };

/** Which viewer or icon an attachment gets, decided once at authoring time. */
export const MEDIA_META: Record<ResourceMediaKind, { label: string; icon: LucideIcon }> = {
  image: { label: "Image", icon: ImageIcon },
  video: { label: "Video", icon: Film },
  audio: { label: "Audio", icon: Headphones },
  pdf: { label: "PDF", icon: FileText },
  doc: { label: "Document", icon: FileText },
  sheet: { label: "Spreadsheet", icon: FileSpreadsheet },
  slide: { label: "Slides", icon: Presentation },
  archive: { label: "Archive", icon: Archive },
  code: { label: "Code", icon: Code2 },
  link: { label: "Link", icon: Link2 },
  other: { label: "File", icon: Paperclip },
};

export const mediaMeta = (kind: string) =>
  MEDIA_META[kind as ResourceMediaKind] ?? MEDIA_META.other;

/** "4 images · 1 PDF" — what's inside, without shipping the attachment list. */
export function mediaLine(kinds: string[], count: number): string {
  if (count === 0) return "No attachments";
  const named = kinds.slice(0, 3).map((k) => mediaMeta(k).label.toLowerCase());
  const rest = kinds.length - named.length;
  const what = named.join(" · ") + (rest > 0 ? ` · +${rest} more` : "");
  return `${plural(count, "file")} — ${what}`;
}

/** A gradient stands in for a cover, seeded off the slug so it stays stable. */
export function resourceTint(slug: string) {
  const hue = hueFromString(slug);
  return {
    background: `linear-gradient(135deg, hsl(${(hue + 32) % 360} 44% 17%), hsl(${hue} 52% 10%) 62%, #16120e)`,
  };
}

/** The standard grid tile. */
export function ResourceCard({ resource: r }: { resource: ResourceSummary }) {
  const meta = typeMeta(r.type);
  const Glyph = meta.icon;
  return (
    <Link href={`/resources/${r.slug}`} className="res-card">
      <span className="res-card__cover" style={r.coverUrl ? undefined : resourceTint(r.slug)}>
        {r.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cloudinaryUrl(r.coverUrl, { width: 520, height: 320 }) ?? undefined} alt="" />
        ) : (
          <Glyph className="res-card__glyph" size={38} strokeWidth={1.4} />
        )}
        <span className="res-card__type">
          <Glyph size={11} /> {meta.label}
        </span>
        {r.isPremium && <span className="res-card__premium">Premium</span>}
      </span>
      <span className="res-card__body">
        <span className="res-card__title">{r.title}</span>
        {r.summary && <span className="res-card__excerpt">{r.summary}</span>}
        <span className="res-card__foot">
          <span className="res-card__cat">
            {r.category ? `${r.category.icon ? `${r.category.icon} ` : ""}${r.category.name}` : "Uncategorised"}
          </span>
          <span className="res-card__stats mono">
            <span title="Reading time">
              <Clock3 size={10} /> {r.readMinutes}m
            </span>
            {r.mediaCount > 0 && (
              <span title={mediaLine(r.mediaKinds, r.mediaCount)}>
                <Paperclip size={10} /> {r.mediaCount}
              </span>
            )}
            <span title="Views">
              <Eye size={10} /> {compact(r.viewCount)}
            </span>
          </span>
        </span>
      </span>
    </Link>
  );
}

/**
 * The wide card at the top of the index. Same data, more of it: an editor picks
 * these with the Featured switch, so the summary is worth showing in full.
 */
export function ResourceFeature({ resource: r }: { resource: ResourceSummary }) {
  const meta = typeMeta(r.type);
  const Glyph = meta.icon;
  return (
    <Link href={`/resources/${r.slug}`} className="res-feature">
      <span className="res-feature__art" style={r.coverUrl ? undefined : resourceTint(r.slug)}>
        {r.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cloudinaryUrl(r.coverUrl, { width: 640, height: 640 }) ?? undefined} alt="" />
        ) : (
          <Glyph className="res-card__glyph" size={46} strokeWidth={1.3} />
        )}
      </span>
      <span className="res-feature__body">
        <span className="res-feature__kicker">
          <Glyph size={11} /> {meta.label}
          {r.category && <span className="res-feature__dot">·</span>}
          {r.category?.name}
        </span>
        <strong className="res-feature__title">{r.title}</strong>
        {r.summary && <span className="res-feature__excerpt">{r.summary}</span>}
        <span className="res-feature__meta mono">
          {r.readMinutes} min read
          {r.mediaCount > 0 ? ` · ${plural(r.mediaCount, "attachment")}` : ""}
          {r.viewCount > 0 ? ` · ${compact(r.viewCount)} views` : ""}
        </span>
      </span>
    </Link>
  );
}
