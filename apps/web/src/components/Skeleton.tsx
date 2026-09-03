/**
 * Loading placeholders.
 *
 * Every page used to announce a pending fetch with the word "Loading…" in grey
 * 12px type, which tells a reader nothing except that the site is slow. These
 * pieces stand in for the shape of the thing being fetched instead, so the
 * layout is already correct when the data lands and nothing jumps.
 *
 * The styling lives in globals.css under `.sk*` — this file only composes it.
 * `.sk` is a shimmering box; everything below is an arrangement of those boxes
 * that matches a real component on the site one-for-one.
 */

/** One shimmering box. `w` is a width percentage class from the `.sk-w-*` set. */
export function Sk({
  className = "",
  w,
  style,
}: {
  className?: string;
  w?: 30 | 45 | 60 | 75;
  style?: React.CSSProperties;
}) {
  return <span className={`sk ${w ? `sk-w-${w}` : ""} ${className}`} style={{ display: "block", ...style }} />;
}

/** Announces to a screen reader what the boxes mean. Visually hidden. */
function Label({ children = "Loading" }: { children?: string }) {
  return <span className="sk-label">{children}…</span>;
}

/** A poster card: cover, title, meta line — the same proportions as CourseCard. */
export function SkCard() {
  return (
    <div className="sk-card">
      <Sk className="sk-cover" />
      <Sk className="sk-line" />
      <Sk className="sk-line sk-line--sm" />
    </div>
  );
}

/** A horizontally scrolling rail of poster cards. */
export function SkRail({ n = 6, label }: { n?: number; label?: string }) {
  return (
    <div className="rail-row" role="status" aria-busy="true">
      <Label>{label}</Label>
      {Array.from({ length: n }, (_, i) => (
        <SkCard key={i} />
      ))}
    </div>
  );
}

/** The six-across poster grid used by browse, search and entity pages. */
export function SkGrid({ n = 12, label }: { n?: number; label?: string }) {
  return (
    <div className="grid" role="status" aria-busy="true">
      <Label>{label}</Label>
      {Array.from({ length: n }, (_, i) => (
        <SkCard key={i} />
      ))}
    </div>
  );
}

/** Numbered title rows (lecturer, organization and publisher pages). */
export function SkRows({ n = 6, label }: { n?: number; label?: string }) {
  return (
    <div className="dark-panel title-list" role="status" aria-busy="true">
      <Label>{label}</Label>
      {Array.from({ length: n }, (_, i) => (
        <div className="sk-row" key={i}>
          <Sk className="sk-thumb" />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
            <Sk className="sk-line sk-line--lg" w={60} />
            <Sk className="sk-line sk-line--sm" w={30} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * An entity detail page: the profile head, then its list of titles.
 *
 * Both halves live in one status region — a nested one would be announced
 * twice — which is also why this is a component rather than two calls.
 */
export function SkEntityPage({ label, rows = 6 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-busy="true">
      <Label>{label}</Label>
      <div className="sk-profile">
        <Sk className="sk-avatar sk-avatar--lg" />
        <div className="sk-stack" style={{ flex: 1, minWidth: 0 }}>
          <Sk className="sk-line sk-line--sm" style={{ width: 76 }} />
          <Sk className="sk-title" w={45} />
          <Sk className="sk-line sk-line--sm" w={30} />
        </div>
      </div>
      <div className="dark-panel title-list" style={{ marginTop: 22 }}>
        {Array.from({ length: rows }, (_, i) => (
          <div className="sk-row" key={i}>
            <Sk className="sk-thumb" />
            <div className="sk-stack" style={{ flex: 1, minWidth: 0 }}>
              <Sk className="sk-line sk-line--lg" w={60} />
              <Sk className="sk-line sk-line--sm" w={30} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Centred avatar cards — the lecturer and channel grids. */
export function SkEntities({ n = 8, label }: { n?: number; label?: string }) {
  return (
    <div className="grid" role="status" aria-busy="true">
      <Label>{label}</Label>
      {Array.from({ length: n }, (_, i) => (
        <div className="sk-entity" key={i}>
          <Sk className="sk-avatar" />
          <Sk className="sk-line" w={75} />
          <Sk className="sk-line sk-line--sm" w={45} />
        </div>
      ))}
    </div>
  );
}

/** Bare rows with no panel around them — sheets, dropdowns, inline lists. */
export function SkList({ n = 4, label }: { n?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true">
      <Label>{label}</Label>
      {Array.from({ length: n }, (_, i) => (
        <div className="sk-row" key={i}>
          <Sk className="sk-thumb sk-thumb--sm" />
          <div className="sk-stack" style={{ flex: 1, minWidth: 0 }}>
            <Sk className="sk-line" w={60} />
            <Sk className="sk-line sk-line--sm" w={30} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Paragraph-shaped lines, for long-form documents. */
export function SkText({ lines = 7, label }: { lines?: number; label?: string }) {
  // The last line of a paragraph is short; without that the block reads as a
  // table rather than as prose.
  const widths: (30 | 45 | 60 | 75 | undefined)[] = [undefined, undefined, 75, undefined, undefined, 60, 45];
  return (
    <div className="sk-text" role="status" aria-busy="true">
      <Label>{label}</Label>
      {Array.from({ length: lines }, (_, i) => (
        <Sk key={i} className="sk-line" w={widths[i % widths.length]} />
      ))}
    </div>
  );
}

/** Cards in an auto-fill grid: collections, learning paths, resources. */
export function SkCards({ n = 6, grid = "lists-grid", label }: { n?: number; grid?: string; label?: string }) {
  return (
    <div className={grid} role="status" aria-busy="true">
      <Label>{label}</Label>
      {Array.from({ length: n }, (_, i) => (
        <div className="dark-panel" key={i} style={{ padding: 14 }}>
          <Sk className="sk-wide" style={{ aspectRatio: "16 / 9" }} />
          <Sk className="sk-line sk-line--lg" w={75} style={{ marginTop: 14 }} />
          <Sk className="sk-line sk-line--sm" w={45} style={{ marginTop: 9 }} />
        </div>
      ))}
    </div>
  );
}

/** A page opening with a big hero: an eyebrow, a title, then the hero itself. */
export function SkHero({ label }: { label?: string }) {
  return (
    <div role="status" aria-busy="true">
      <Label>{label}</Label>
      <Sk className="sk-line sk-line--sm" style={{ width: 90 }} />
      <Sk className="sk-title" w={60} style={{ marginTop: 14 }} />
      <Sk className="sk-hero" style={{ marginTop: 22 }} />
    </div>
  );
}

/** The default whole-page placeholder: a heading and one or more rails. */
export function SkPage({ label, rails = 2 }: { label?: string; rails?: number }) {
  return (
    <div role="status" aria-busy="true">
      <Label>{label}</Label>
      <Sk className="sk-line sk-line--sm" style={{ width: 84 }} />
      <Sk className="sk-title" w={45} style={{ marginTop: 13 }} />
      {/* The rail markup is repeated here rather than reusing <SkRail>, which
          carries its own status role — two nested live regions get announced
          twice. */}
      {Array.from({ length: rails }, (_, i) => (
        <div key={i} style={{ marginTop: 34 }}>
          <Sk className="sk-line sk-line--lg" style={{ width: 150, marginBottom: 16 }} />
          <div className="rail-row">
            {Array.from({ length: 6 }, (_, j) => (
              <SkCard key={j} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
