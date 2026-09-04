"use client";

import Link from "next/link";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { compact, plural } from "@/lib/format";

/**
 * Lecturer and publisher cards.
 *
 * A rail cell is 145–230px wide. The old layout put a 40px avatar beside the
 * text inside that budget, which left ~90px for a name like "Kumaran
 * Ponnambalam" — so every card broke its name across three ragged lines and
 * the meta line wrapped mid-word. These are centred and vertical instead: the
 * full width goes to the name, clamped at two lines.
 */
function EntityCard({
  href,
  name,
  imageUrl,
  role,
  meta,
  variant,
}: {
  href: string;
  name: string;
  imageUrl: string | null;
  role: string;
  meta: string;
  variant: "person" | "org";
}) {
  return (
    <Link href={href} className={`entity-card entity-card--${variant}`}>
      <span className="entity-card__avatar">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cloudinaryUrl(imageUrl, { width: 160, height: 160 }) ?? undefined} alt="" />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </span>
      <span className="entity-card__body">
        <span className="entity-card__name">{name}</span>
        <span className="entity-card__role">{role}</span>
        <span className="entity-card__meta">{meta}</span>
      </span>
    </Link>
  );
}

export function LecturerCard({
  lecturer,
}: {
  lecturer: { slug: string; name: string; photoUrl: string | null; courseCount: number; credentials?: string | null };
}) {
  return (
    <EntityCard
      variant="person"
      href={`/lecturers/${lecturer.slug}`}
      name={lecturer.name}
      imageUrl={lecturer.photoUrl}
      role={lecturer.credentials?.trim() || "Lecturer"}
      meta={plural(lecturer.courseCount, "course")}
    />
  );
}

export function PublisherCard({
  org,
}: {
  org: { slug: string; name: string; logoUrl: string | null; subscribers: number; courseCount: number };
}) {
  return (
    <EntityCard
      variant="org"
      href={`/organizations/${org.slug}`}
      name={org.name}
      imageUrl={org.logoUrl}
      role="Publisher"
      meta={
        org.subscribers > 0
          ? `${compact(org.subscribers)} learners · ${plural(org.courseCount, "course")}`
          : plural(org.courseCount, "course")
      }
    />
  );
}
