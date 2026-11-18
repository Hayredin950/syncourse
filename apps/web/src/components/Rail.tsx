"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** A phono rail: a section head with a chevron, then a snap-scrolling row. */
export function Rail({
  title,
  subtitle,
  href,
  right,
  children,
  rank,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  right?: ReactNode;
  children: ReactNode;
  rank?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    const el = row.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(320, el.clientWidth * 0.82), behavior: "smooth" });
  };

  return (
    <section className="rail">
      <div className="section-head">
        <div className="section-head__left" style={{ display: "block" }}>
          <h2>
            {href ? (
              <Link href={href} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "inherit" }}>
                {title}
                <ChevronRight className="chev" size={21} strokeWidth={1.8} />
              </Link>
            ) : (
              title
            )}
          </h2>
          {subtitle && <p className="section-sub">{subtitle}</p>}
        </div>
        {right && <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{right}</div>}
      </div>
      <div className="rail-wrap">
        <button type="button" className="rail-arrow rail-arrow--prev" aria-label="Scroll left" onClick={() => scroll(-1)}>
          <ChevronLeft size={20} />
        </button>
        <div className={`rail-row no-scrollbar ${rank ? "rank-row" : ""}`} ref={row}>
          {children}
        </div>
        <button type="button" className="rail-arrow rail-arrow--next" aria-label="Scroll right" onClick={() => scroll(1)}>
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  );
}
