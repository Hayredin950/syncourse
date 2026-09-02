"use client";

import type { ReactNode } from "react";

/**
 * A small markdown renderer.
 *
 * Legal documents and Telegram-sourced resources are authored in markdown and
 * were printed raw, so readers saw `##` and `**` instead of headings and bold.
 * A library would be the obvious fix, but the web app is a static export and the
 * same copy is rendered again by the React Native client, so the parser lives
 * here: headings, emphasis, code, links, images, lists, quotes, rules and pipe
 * tables. Nothing goes through dangerouslySetInnerHTML, so admin-authored text
 * cannot inject markup.
 *
 * One deliberate departure from CommonMark: a single newline inside a paragraph
 * becomes a <br>. These documents are written as if line breaks are literal —
 * collapsing them turned addresses and clause lists into one run-on block.
 */

const SAFE_HREF = /^(?:https?:\/\/|mailto:|\/|#)/i;
const safeHref = (href: string) => (SAFE_HREF.test(href) ? href : "#");

/**
 * `## Cheat sheet basics` → `cheat-sheet-basics`, so a table of contents can
 * link into a rendered document. Two headings with the same text get the same
 * id and the browser jumps to the first — cheaper than a dedupe counter that
 * both the renderer and `markdownHeadings` would have to increment in lockstep.
 */
export function headingSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[`*_~]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!~>|]/;

/* ---------- inline ---------- */

function inlineNodes(src: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = "";
  let n = 0;
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };
  const push = (node: ReactNode) => {
    flush();
    out.push(node);
  };
  for (let i = 0; i < src.length; ) {
    const rest = src.slice(i);
    const k = `${key}-${n++}`;
    // A backslash escape is the only way to write a literal * or _ in prose.
    if (rest[0] === "\\" && rest.length > 1 && ESCAPABLE.test(rest[1])) {
      buf += rest[1];
      i += 2;
      continue;
    }
    if (rest[0] === "\n") {
      push(<br key={k} />);
      i += 1;
      continue;
    }
    let m = /^`([^`]+)`/.exec(rest);
    if (m) {
      push(
        <code key={k} className="md-code">
          {m[1]}
        </code>,
      );
      i += m[0].length;
      continue;
    }
    m = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest);
    if (m) {
      push(
        // eslint-disable-next-line @next/next/no-img-element
        <img key={k} src={safeHref(m[2])} alt={m[1]} className="md-img" />,
      );
      i += m[0].length;
      continue;
    }
    m = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest);
    if (m) {
      const label = m[1];
      push(
        <a key={k} href={safeHref(m[2])} target="_blank" rel="noreferrer">
          {inlineNodes(label, k)}
        </a>,
      );
      i += m[0].length;
      continue;
    }
    m = /^(\*\*|__)([\s\S]+?)\1/.exec(rest);
    if (m) {
      push(<strong key={k}>{inlineNodes(m[2], k)}</strong>);
      i += m[0].length;
      continue;
    }
    m = /^~~([\s\S]+?)~~/.exec(rest);
    if (m) {
      push(<s key={k}>{inlineNodes(m[1], k)}</s>);
      i += m[0].length;
      continue;
    }
    // `snake_case` is not emphasis, so `_` may only open one at a word boundary.
    m =
      /^\*([^*\n]+)\*/.exec(rest) ??
      (i === 0 || !/\w/.test(src[i - 1]) ? /^_([^_\n]+)_/.exec(rest) : null);
    if (m) {
      push(<em key={k}>{inlineNodes(m[1], k)}</em>);
      i += m[0].length;
      continue;
    }
    m = /^(https?:\/\/[^\s<>()[\]]+)/.exec(rest);
    if (m) {
      push(
        <a key={k} href={m[1]} target="_blank" rel="noreferrer">
          {m[1]}
        </a>,
      );
      i += m[0].length;
      continue;
    }
    buf += rest[0];
    i += 1;
  }
  flush();
  return out;
}

/* ---------- blocks ---------- */

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/;
const TABLE_DIV = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;

/** Does this line open a block of its own? Ends paragraphs, items and quotes. */
function isBlockStart(line: string): boolean {
  return (
    !line.trim() ||
    FENCE.test(line) ||
    HEADING.test(line) ||
    HR.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line)
  );
}

const cells = (row: string) =>
  row
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());

function blockNodes(src: string, key: string, anchors = false): ReactNode[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `${key}-${n++}`;
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith(marker)) body.push(lines[i++]);
      i += 1; // closing fence, or past the end for an unterminated block
      out.push(
        <pre key={k} className="md-pre">
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      // The page owns its <h1>, so `#` starts at <h2> and the visual size comes
      // from the class — one h1 per document keeps the outline readable.
      const depth = heading[1].length;
      const Tag = `h${Math.min(depth + 1, 6)}` as "h2";
      out.push(
        <Tag key={k} id={anchors ? headingSlug(heading[2]) : undefined} className={`md-h md-h${depth}`}>
          {inlineNodes(heading[2], k)}
        </Tag>,
      );
      i += 1;
      continue;
    }

    if (HR.test(line)) {
      out.push(<hr key={k} className="md-hr" />);
      i += 1;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_DIV.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(cells(lines[i++]));
      out.push(
        <div key={k} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {head.map((c, ci) => (
                  <th key={ci}>{inlineNodes(c, `${k}-h${ci}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>{inlineNodes(c, `${k}-${ri}-${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i]);
        if (q) {
          body.push(q[1]);
          i += 1;
          continue;
        }
        if (lines[i].trim() && !isBlockStart(lines[i])) {
          body.push(lines[i].trim());
          i += 1;
          continue;
        }
        break;
      }
      out.push(
        <blockquote key={k} className="md-quote">
          {blockNodes(body.join("\n"), k, anchors)}
        </blockquote>,
      );
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = !BULLET.test(line);
      // Nesting flattens: these documents use one level, and a wrong indent
      // guess reads worse than a flat list.
      const items: string[][] = [];
      while (i < lines.length) {
        const l = lines[i];
        const b = BULLET.exec(l);
        const o = ORDERED.exec(l);
        if (b || o) {
          // A bullet after a numbered run (or the reverse) starts a new list.
          if (!b !== ordered) break;
          items.push([b ? b[1] : o![2]]);
          i += 1;
          continue;
        }
        if (l.trim() && items.length && !isBlockStart(l)) {
          items[items.length - 1].push(l.trim());
          i += 1;
          continue;
        }
        break;
      }
      const List = ordered ? "ol" : "ul";
      out.push(
        <List key={k} className="md-list">
          {items.map((it, ii) => (
            <li key={`${k}-${ii}`}>{inlineNodes(it.join("\n"), `${k}-${ii}`)}</li>
          ))}
        </List>,
      );
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isBlockStart(lines[i]) &&
      !(lines[i].includes("|") && TABLE_DIV.test(lines[i]))
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={k} className="md-p">
        {inlineNodes(para.join("\n"), k)}
      </p>,
    );
  }
  return out;
}

/**
 * Render markdown source. `text` may be null so callers can pass API fields.
 *
 * `anchors` puts an id on every heading — only worth it on a page that also
 * shows a table of contents, since ids are global and a page can hold two
 * documents.
 */
export function Markdown({
  text,
  className,
  anchors,
}: {
  text: string | null | undefined;
  className?: string;
  anchors?: boolean;
}) {
  return (
    <div className={className ? `md ${className}` : "md"}>{blockNodes(text ?? "", "md", anchors)}</div>
  );
}

/**
 * The headings of a document, in order, for a table of contents. Fenced code is
 * skipped so a `# comment` in a shell block does not become a section.
 */
export function markdownHeadings(
  text: string | null | undefined,
): { depth: number; text: string; id: string }[] {
  const out: { depth: number; text: string; id: string }[] = [];
  let inFence = false;
  for (const line of (text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING.exec(line);
    if (!m) continue;
    const plain = m[2].replace(/[`*_~]/g, "").trim();
    if (plain) out.push({ depth: m[1].length, text: plain, id: headingSlug(m[2]) });
  }
  return out;
}

/** Markdown stripped to one line — for previews, cards and meta descriptions. */
export function markdownExcerpt(text: string | null | undefined, max = 180): string {
  const flat = (text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*[#>\-*+]+\s*/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
