import React from "react";
import { Image, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/tokens";

/**
 * The React Native half of the markdown renderer.
 *
 * Legal documents and resources are authored once and rendered by both clients,
 * so this deliberately mirrors `apps/web/src/components/Markdown.tsx`: same
 * subset (headings, emphasis, code, links, images, lists, quotes, rules, pipe
 * tables) and the same departure from CommonMark, where a single newline inside
 * a paragraph is a real line break.
 *
 * `react-native-markdown-display` would cover this, but the parser is small and
 * a shared subset that behaves identically on both clients is worth more than
 * the dependency.
 */

const SAFE_HREF = /^(?:https?:\/\/|mailto:)/i;
const ESCAPABLE = /[\\`*_{}[\]()#+\-.!~>|]/;

const open = (href: string) => {
  if (SAFE_HREF.test(href)) void Linking.openURL(href);
};

type Style = Record<string, unknown>;

/* ---------- inline ---------- */

/**
 * Emphasis nests, so each span carries the styles of everything above it — RN
 * text styles don't cascade the way CSS does once a <Text> sets fontWeight.
 */
function inlineNodes(src: string, key: string, inherited: Style[]): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let buf = "";
  let n = 0;
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };
  const push = (node: React.ReactNode) => {
    flush();
    out.push(node);
  };
  for (let i = 0; i < src.length; ) {
    const rest = src.slice(i);
    const k = `${key}-${n++}`;
    if (rest[0] === "\\" && rest.length > 1 && ESCAPABLE.test(rest[1])) {
      buf += rest[1];
      i += 2;
      continue;
    }
    let m = /^`([^`]+)`/.exec(rest);
    if (m) {
      push(
        <Text key={k} style={[...inherited, styles.code]}>
          {m[1]}
        </Text>,
      );
      i += m[0].length;
      continue;
    }
    m = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest);
    if (m) {
      // An inline image has no intrinsic size here, so it is dropped to its alt
      // text; block-level images are handled by blockNodes.
      push(
        <Text key={k} style={[...inherited, styles.dim]}>
          {m[1] || "image"}
        </Text>,
      );
      i += m[0].length;
      continue;
    }
    m = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest);
    if (m) {
      const href = m[2];
      push(
        <Text key={k} style={[...inherited, styles.link]} onPress={() => open(href)}>
          {inlineNodes(m[1], k, [...inherited, styles.link])}
        </Text>,
      );
      i += m[0].length;
      continue;
    }
    m = /^(\*\*|__)([\s\S]+?)\1/.exec(rest);
    if (m) {
      const next = [...inherited, styles.strong];
      push(
        <Text key={k} style={next}>
          {inlineNodes(m[2], k, next)}
        </Text>,
      );
      i += m[0].length;
      continue;
    }
    m = /^~~([\s\S]+?)~~/.exec(rest);
    if (m) {
      const next = [...inherited, styles.strike];
      push(
        <Text key={k} style={next}>
          {inlineNodes(m[1], k, next)}
        </Text>,
      );
      i += m[0].length;
      continue;
    }
    m =
      /^\*([^*\n]+)\*/.exec(rest) ??
      (i === 0 || !/\w/.test(src[i - 1]) ? /^_([^_\n]+)_/.exec(rest) : null);
    if (m) {
      const next = [...inherited, styles.em];
      push(
        <Text key={k} style={next}>
          {inlineNodes(m[1], k, next)}
        </Text>,
      );
      i += m[0].length;
      continue;
    }
    m = /^(https?:\/\/[^\s<>()[\]]+)/.exec(rest);
    if (m) {
      const href = m[1];
      push(
        <Text key={k} style={[...inherited, styles.link]} onPress={() => open(href)}>
          {href}
        </Text>,
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
const IMAGE_ONLY = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const TABLE_DIV = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;

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

function blockNodes(src: string, key: string): React.ReactNode[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
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
      i += 1;
      out.push(
        <View key={k} style={styles.pre}>
          <Text style={styles.preText}>{body.join("\n")}</Text>
        </View>,
      );
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const style = HEADING_STYLES[Math.min(heading[1].length, 6) - 1];
      out.push(
        <Text key={k} style={style}>
          {inlineNodes(heading[2], k, [style])}
        </Text>,
      );
      i += 1;
      continue;
    }

    if (HR.test(line)) {
      out.push(<View key={k} style={styles.hr} />);
      i += 1;
      continue;
    }

    const img = IMAGE_ONLY.exec(line);
    if (img) {
      out.push(
        <Image key={k} source={{ uri: img[2] }} style={styles.image} resizeMode="cover" />,
      );
      i += 1;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_DIV.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(cells(lines[i++]));
      out.push(
        <ScrollView key={k} horizontal showsHorizontalScrollIndicator={false} style={styles.tableWrap}>
          <View>
            <View style={[styles.tr, styles.thead]}>
              {head.map((c, ci) => (
                <Text key={ci} style={[styles.cell, styles.th]} numberOfLines={2}>
                  {c}
                </Text>
              ))}
            </View>
            {rows.map((r, ri) => (
              <View key={ri} style={styles.tr}>
                {r.map((c, ci) => (
                  <Text key={ci} style={styles.cell}>
                    {inlineNodes(c, `${k}-${ri}-${ci}`, [styles.cell])}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>,
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
        <View key={k} style={styles.quote}>
          {blockNodes(body.join("\n"), k)}
        </View>,
      );
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = !BULLET.test(line);
      const items: string[][] = [];
      while (i < lines.length) {
        const l = lines[i];
        const b = BULLET.exec(l);
        const o = ORDERED.exec(l);
        if (b || o) {
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
      out.push(
        <View key={k} style={styles.list}>
          {items.map((it, ii) => (
            <View key={`${k}-${ii}`} style={styles.li}>
              <Text style={styles.bullet}>{ordered ? `${ii + 1}.` : "•"}</Text>
              <Text style={styles.liText}>{inlineNodes(it.join("\n"), `${k}-${ii}`, [styles.liText])}</Text>
            </View>
          ))}
        </View>,
      );
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isBlockStart(lines[i]) &&
      !IMAGE_ONLY.test(lines[i]) &&
      !(lines[i].includes("|") && TABLE_DIV.test(lines[i]))
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(
      <Text key={k} style={styles.p}>
        {inlineNodes(para.join("\n"), k, [styles.p])}
      </Text>,
    );
  }
  return out;
}

/** Render markdown source. `text` may be null so callers can pass API fields. */
export function Markdown({ text }: { text: string | null | undefined }) {
  return <View>{blockNodes(text ?? "", "md")}</View>;
}

const styles = StyleSheet.create({
  p: { color: colors.text, fontSize: 13.5, lineHeight: 21, marginBottom: 12 },
  h1: { color: colors.text, fontSize: 21, fontWeight: "800", lineHeight: 27, marginTop: 18, marginBottom: 8 },
  h2: { color: colors.text, fontSize: 18, fontWeight: "800", lineHeight: 24, marginTop: 16, marginBottom: 7 },
  h3: { color: colors.text, fontSize: 15.5, fontWeight: "800", lineHeight: 21, marginTop: 14, marginBottom: 6 },
  h4: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1, marginTop: 12, marginBottom: 5 },
  h5: { color: colors.accent, fontSize: 11.5, fontWeight: "800", letterSpacing: 1, marginTop: 12, marginBottom: 5 },
  h6: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 12, marginBottom: 5 },
  strong: { fontWeight: "800", color: colors.text },
  em: { fontStyle: "italic" },
  strike: { textDecorationLine: "line-through" },
  link: { color: colors.accent, textDecorationLine: "underline" },
  dim: { color: colors.dim },
  code: { color: colors.accent, fontFamily: "monospace", fontSize: 12.5 },
  pre: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 11,
    marginBottom: 13,
  },
  preText: { color: colors.text, fontFamily: "monospace", fontSize: 11.5, lineHeight: 18 },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 12,
    marginBottom: 13,
  },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  image: { width: "100%", height: 200, borderRadius: radius.md, marginBottom: 13 },
  list: { marginBottom: 13, gap: 6 },
  li: { flexDirection: "row", gap: 8 },
  bullet: { color: colors.accent, fontSize: 13.5, lineHeight: 21, fontWeight: "800", minWidth: 16 },
  liText: { color: colors.text, fontSize: 13.5, lineHeight: 21, flex: 1 },
  tableWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginBottom: 13,
  },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  thead: { backgroundColor: colors.accentSoft },
  cell: { color: colors.text, fontSize: 12, lineHeight: 18, paddingHorizontal: 11, paddingVertical: 8, minWidth: 110 },
  th: { color: colors.accent, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6 },
});

const HEADING_STYLES = [styles.h1, styles.h2, styles.h3, styles.h4, styles.h5, styles.h6];

