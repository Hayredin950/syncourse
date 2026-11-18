/**
 * The text-extraction core shared by both indexing waves.
 *
 * It lives here rather than in either script because the rules must not drift:
 * a filename is indexed even when its payload is a 2 GB video, subtitles are
 * cleaned the same way whether the archive arrived through the Bot API or
 * MTProto, and one pathological PDF must hit the same budget in both paths.
 *
 * Nothing here touches the database or the network.
 */
import AdmZip from 'adm-zip';
import { PDFParse } from 'pdf-parse';
import yauzl from 'yauzl';
import { createHash } from 'node:crypto';

export interface ChunkRow {
  sourceKind: string;
  sourceName: string;
  moduleTitle: string | null;
  partIndex: number | null;
  ordinal: number;
  text: string;
}

/** Guardrails so one pathological archive cannot fill the free database tier. */
export const MAX_TEXT_PER_LINK = 2_000_000; // characters
export const MAX_CHUNKS_PER_LINK = 2_000;
export const CHUNK_SIZE = 1_200;
export const CHUNK_OVERLAP = 200;

/** Text containers we can read without any external service. */
export const TEXT_EXTS = new Set([
  'srt', 'vtt', 'txt', 'md', 'markdown', 'json', 'html', 'htm', 'csv',
  'url', 'rtf', 'xml', 'yaml', 'yml', 'nfo',
]);
export const PDF_EXTS = new Set(['pdf']);
export const ARCHIVE_EXTS = new Set(['zip']);
export const DOCX_EXTS = new Set(['docx']);

/** Media and images: never downloaded, but their names are still indexed. */
export const MEDIA_EXTS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'mp3', 'm4a', 'wav', 'ogg',
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp',
]);

/** One absurd PDF inside an archive must not be inflated into memory. */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

export function extOf(name: string): string {
  const clean = name.split('?')[0].split('#')[0];
  const m = clean.match(/\.([a-zA-Z0-9]{1,6})$/);
  return m ? m[1].toLowerCase() : '';
}

/** True when the extension could contain text worth extracting. */
export function isTextBearing(ext: string): boolean {
  return TEXT_EXTS.has(ext) || PDF_EXTS.has(ext) || DOCX_EXTS.has(ext) || ARCHIVE_EXTS.has(ext);
}

/** `07. The_InitState_Method.mp4` → `07. The InitState Method` */
export function humanize(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base
    .replace(/\.[a-zA-Z0-9]{1,6}$/, '')
    .replace(/[_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hash(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (m) => NAMED_ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Subtitles are the cheapest transcript there is: the packager already wrote
 * one per lesson. Strip cue numbers, timestamps and markup, and collapse the
 * rolling duplicates that auto-captions repeat on every line.
 */
export function cleanSubtitle(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/^WEBVTT.*$/gim, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^\d+$/.test(line)) return false;
      if (/^\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(line)) return false;
      if (/^\d{1,2}:\d{2}[,.]\d{1,3}\s*-->/.test(line)) return false;
      if (/^NOTE\b/i.test(line)) return false;
      return true;
    })
    .map((line) =>
      line
        .replace(/<[^>]+>/g, '')
        .replace(/\{\\[^}]+\}/g, '')
        .replace(/^[A-Z][A-Z0-9 _-]{1,30}:\s*/, '') // speaker labels
        .trim(),
    )
    .filter(Boolean)
    .filter((line, i, arr) => i === 0 || line !== arr[i - 1])
    .join('\n');
}

/** A .docx is a ZIP with one XML story inside. */
export function extractDocx(buf: Buffer): string {
  try {
    const zip = new AdmZip(buf);
    const entry = zip.getEntry('word/document.xml');
    if (!entry) return '';
    const xml = entry.getData().toString('utf8');
    return stripHtml(xml.replace(/<\/w:p>/gi, '\n').replace(/<w:tab\/>/gi, '\t'));
  } catch {
    return '';
  }
}

export async function extractFile(
  name: string,
  buf: Buffer,
): Promise<{ kind: string; text: string } | null> {
  const ext = extOf(name);
  try {
    if (PDF_EXTS.has(ext)) {
      // pdf-parse 2.x: construct, read, then release the worker explicitly.
      // A scanned PDF yields no text — that is a skip, not a failure.
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      try {
        const parsed = await parser.getText();
        return { kind: 'pdf', text: (parsed.text || '').trim() };
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    }
    if (ARCHIVE_EXTS.has(ext)) {
      // Callers handle archives entry-by-entry.
      return null;
    }
    if (DOCX_EXTS.has(ext)) {
      return { kind: 'text', text: extractDocx(buf) };
    }
    if (ext === 'srt' || ext === 'vtt') {
      return { kind: 'subtitle', text: cleanSubtitle(buf.toString('utf8')) };
    }
    if (ext === 'html' || ext === 'htm') {
      return { kind: 'html', text: stripHtml(buf.toString('utf8')) };
    }
    if (ext === 'json') {
      // n8n workflow exports are JSON; keep them readable for search and for
      // the assistant, but do not store megabytes of minified noise.
      const raw = buf.toString('utf8');
      let pretty = raw;
      try {
        pretty = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        // keep raw
      }
      return { kind: 'json', text: pretty.slice(0, 200_000) };
    }
    if (TEXT_EXTS.has(ext)) {
      return { kind: 'text', text: buf.toString('utf8') };
    }
  } catch (err) {
    throw new Error(`extract ${name}: ${(err as Error).message}`);
  }
  return null;
}

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];

  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      const boundary = clean.lastIndexOf('\n\n', end);
      if (boundary > i + CHUNK_SIZE * 0.5) end = boundary;
    }
    const piece = clean.slice(i, end).trim();
    if (piece) out.push(piece);
    if (end >= clean.length) break;
    i = Math.max(end - CHUNK_OVERLAP, i + 1);
  }
  return out;
}

/** One chunk per archive entry, so lesson titles are searchable with no download. */
export function nameChunk(entryName: string): ChunkRow {
  return {
    sourceKind: 'entry-name',
    sourceName: `entry:${entryName}`,
    moduleTitle: null,
    partIndex: null,
    ordinal: 0,
    text: humanize(entryName),
  };
}

/** In-memory archive extraction — fine for the < 20 MB Bot API wave. */
export async function extractZip(buf: Buffer): Promise<ChunkRow[]> {
  const zip = new AdmZip(buf);
  const rows: ChunkRow[] = [];

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;
    const ext = extOf(name);

    // The name is free knowledge even when the payload is a 150 MB video.
    rows.push(nameChunk(name));

    if (MEDIA_EXTS.has(ext)) continue;
    if (!TEXT_EXTS.has(ext) && !PDF_EXTS.has(ext) && !DOCX_EXTS.has(ext)) continue;

    let data: Buffer;
    try {
      data = entry.getData();
    } catch {
      continue; // corrupt or encrypted entry: keep the name, skip the body
    }
    const extracted = await extractFile(name, data);
    if (!extracted || extracted.text.trim().length < 20) continue;

    chunkText(extracted.text).forEach((text, ordinal) => {
      rows.push({
        sourceKind: extracted.kind,
        sourceName: name,
        moduleTitle: null,
        partIndex: null,
        ordinal,
        text,
      });
    });
  }
  return rows;
}

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err || !zip) reject(err ?? new Error('could not open the archive'));
      else resolve(zip);
    });
  });
}

/**
 * Read one entry into memory, refusing anything above `limit`. Rejects become
 * `null`: a corrupt entry is a skip, never a failed file.
 */
function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, limit: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    if (entry.uncompressedSize > limit) {
      resolve(null);
      return;
    }
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let overflow = false;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) overflow = true;
        else chunks.push(chunk);
      });
      stream.on('end', () => resolve(overflow ? null : Buffer.concat(chunks)));
      stream.on('error', () => resolve(null));
    });
  });
}

/**
 * Streaming archive extraction for files the Bot API cannot serve.
 *
 * `adm-zip` reads the whole file into memory; a 1.9 GB course archive would
 * then be inflated a second time while entries are read. `yauzl` walks the
 * central directory and opens only the entries we actually want, so video
 * bytes are never decompressed. The text budget is enforced as we go, so a
 * pathological archive stops early instead of exhausting the runner.
 */
export async function extractZipFromPath(
  zipPath: string,
  budget: { maxText?: number; maxChunks?: number } = {},
): Promise<ChunkRow[]> {
  const maxText = budget.maxText ?? MAX_TEXT_PER_LINK;
  const maxChunks = budget.maxChunks ?? MAX_CHUNKS_PER_LINK;
  const rows: ChunkRow[] = [];
  let chars = 0;
  const zip = await openZip(zipPath);

  return new Promise<ChunkRow[]>((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        zip.close();
      } catch {
        // already closed
      }
      if (err) reject(err);
      else resolve(rows);
    };

    zip.on('error', (err) => finish(err));
    zip.on('end', () => finish());
    zip.on('entry', (entry: yauzl.Entry) => {
      void (async () => {
        try {
          if (!entry.fileName.endsWith('/')) {
            rows.push(nameChunk(entry.fileName));
            const ext = extOf(entry.fileName);

            if (!MEDIA_EXTS.has(ext) && isTextBearing(ext) && ext !== 'zip') {
              const data = await readEntry(zip, entry, MAX_ENTRY_BYTES);
              if (data) {
                const extracted = await extractFile(entry.fileName, data);
                if (extracted && extracted.text.trim().length >= 20) {
                  const pieces = chunkText(extracted.text);
                  for (let ordinal = 0; ordinal < pieces.length; ordinal++) {
                    const text = pieces[ordinal];
                    if (rows.length >= maxChunks || chars + text.length > maxText) {
                      finish();
                      return;
                    }
                    chars += text.length;
                    rows.push({
                      sourceKind: extracted.kind,
                      sourceName: entry.fileName,
                      moduleTitle: null,
                      partIndex: null,
                      ordinal,
                      text,
                    });
                  }
                }
              }
            }
          }
        } catch {
          // One unreadable entry must not abandon the other 400.
        }
        if (!settled) zip.readEntry();
      })();
    });

    zip.readEntry();
  });
}

/** Keep one pathological archive from exhausting the free database tier. */
export function trimToBudget(rows: ChunkRow[]): ChunkRow[] {
  const out: ChunkRow[] = [];
  let chars = 0;
  for (const row of rows) {
    if (out.length >= MAX_CHUNKS_PER_LINK) break;
    if (chars + row.text.length > MAX_TEXT_PER_LINK) break;
    chars += row.text.length;
    out.push(row);
  }
  return out;
}
