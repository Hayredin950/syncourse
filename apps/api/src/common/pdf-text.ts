/**
 * pdf-lib's standard fonts only encode WinAnsi. Receipts and certificates draw
 * names, course titles and bank references straight into the page, and any
 * arrow, emoji or Amharic glyph threw `WinAnsi cannot encode …` — a 500 where a
 * PDF should have been. Transliterate the common typographic characters and
 * replace anything else the encoding cannot carry, so a receipt always prints.
 */
const SUBSTITUTIONS: Record<string, string> = {
  '\u2192': 'to',
  '\u2190': 'from',
  '\u2194': '-',
  '\u2013': '-',
  '\u2014': '-',
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2026': '...',
  '\u2022': '-',
  '\u00B7': '-',
  '\u20AC': 'EUR',
  '\u00A3': 'GBP',
  '\u00A5': 'JPY',
  '\u20B9': 'INR',
  '\u00A0': ' ',
};

export function pdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u2190-\u21FF\u2010-\u2027\u2030-\u205F\u20A0-\u20CF\u00A0]/g, (c) => SUBSTITUTIONS[c] ?? '-')
    // Latin-1 is inside WinAnsi; everything outside it becomes a plain marker
    // rather than an exception. Accented Latin names survive unchanged.
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A1-\u00FF]/g, '?');
}
