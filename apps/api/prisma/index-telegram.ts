/**
 * index-telegram.ts
 *
 * Builds the searchable text layer for courses delivered as Telegram ZIPs.
 *
 * Why this exists: a course's real structure lives inside archives the app
 * never opens. Search only saw 13 course titles. This script extracts the useful
 * text — subtitle dialogue, PDF notes, n8n JSON, readmes, and every filename —
 * and stores it as `ContentChunk` rows. Video bytes are never stored or parsed.
 *
 * Two waves, both resumable:
 *
 *   1. names     — index module/file/entry names. No download, no token needed.
 *                  This alone makes "which module covers CrewAI?" searchable.
 *   2. download  — fetch files that fit the free Bot API limit (< 20 MB) and
 *                  extract their text. Larger files are left `pending` for the
 *                  GitHub Actions worker (Phase 4).
 *
 * Usage (from the repo root):
 *
 *   npx tsx --env-file=apps/api/.env apps/api/prisma/index-telegram.ts --names
 *   npx tsx --env-file=apps/api/.env apps/api/prisma/index-telegram.ts --download --dry-run
 *   npx tsx --env-file=apps/api/.env apps/api/prisma/index-telegram.ts --download \
 *     --course rag-ai-agents-and-generative-ai-with-python-and-openai-2025
 *   npx tsx --env-file=apps/api/.env apps/api/prisma/index-telegram.ts --stats
 *
 * Flags:
 *   --names              index names only (default when no flag is given)
 *   --download           fetch and extract text from eligible files
 *   --dry-run            report what would happen; writes nothing
 *   --course <slug>      restrict to one course
 *   --limit <n>          process at most n attachments
 *   --max-mb <n>         download ceiling (default 19; Bot API caps at 20)
 *   --force              re-process attachments already marked indexed
 *   --stats              print index status counts and exit
 */
import { PrismaClient } from '@prisma/client';
import AdmZip from 'adm-zip';
import { PDFParse } from 'pdf-parse';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

/** The Bot API refuses `getFile` above 20 MB; 19 leaves a margin. */
const DEFAULT_MAX_MB = 19;

/** Text containers we can read without any external service. */
const TEXT_EXTS = new Set([
  'srt', 'vtt', 'txt', 'md', 'markdown', 'json', 'html', 'htm', 'csv',
  'url', 'rtf', 'xml', 'yaml', 'yml', 'nfo',
]);
const PDF_EXTS = new Set(['pdf']);
const ARCHIVE_EXTS = new Set(['zip']);
const DOCX_EXTS = new Set(['docx']);

/** Media and images: never downloaded, but their names are still indexed. */
const MEDIA_EXTS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'mp3', 'm4a', 'wav', 'ogg',
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp',
]);

/** Guardrails so one pathological PDF cannot fill the free database tier. */
const MAX_TEXT_PER_LINK = 2_000_000; // characters
const MAX_CHUNKS_PER_LINK = 2_000;
const CHUNK_SIZE = 1_200;
const CHUNK_OVERLAP = 200;

interface Args {
  names: boolean;
  download: boolean;
  dryRun: boolean;
  force: boolean;
  stats: boolean;
  course?: string;
  limit?: number;
  maxMb: number;
}

interface ChunkRow {
  sourceKind: string;
  sourceName: string;
  moduleTitle: string | null;
  partIndex: number | null;
  ordinal: number;
  text: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    names: false,
    download: false,
    dryRun: false,
    force: false,
    stats: false,
    maxMb: DEFAULT_MAX_MB,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--names': args.names = true; break;
      case '--download': args.download = true; break;
      case '--dry-run': args.dryRun = true; break;
      case '--force': args.force = true; break;
      case '--stats': args.stats = true; break;
      case '--course': args.course = argv[++i]; break;
      case '--limit': args.limit = Number(argv[++i]); break;
      case '--max-mb': args.maxMb = Number(argv[++i]); break;
      default:
        if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    }
  }
  // No explicit wave means: do the free wave, and the paid-in-bandwidth one
  // only if a bot token is available.
  if (!args.names && !args.download && !args.stats) {
    args.names = true;
    args.download = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  }
  return args;
}

function extOf(name: string): string {
  const clean = name.split('?')[0].split('#')[0];
  const m = clean.match(/\.([a-zA-Z0-9]{1,6})$/);
  return m ? m[1].toLowerCase() : '';
}

/** `07. The_InitState_Method.mp4` → `07. The InitState Method` */
function humanize(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base
    .replace(/\.[a-zA-Z0-9]{1,6}$/, '')
    .replace(/[_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hash(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

// ---------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};

function stripHtml(html: string): string {
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
function cleanSubtitle(raw: string): string {
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
function extractDocx(buf: Buffer): string {
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

async function extractFile(name: string, buf: Buffer): Promise<{ kind: string; text: string } | null> {
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
      return { kind: ext === 'md' || ext === 'markdown' ? 'text' : 'text', text: buf.toString('utf8') };
    }
  } catch (err) {
    throw new Error(`extract ${name}: ${(err as Error).message}`);
  }
  return null;
}

function chunkText(text: string): string[] {
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
function nameChunk(entryName: string): ChunkRow {
  return {
    sourceKind: 'entry-name',
    sourceName: `entry:${entryName}`,
    moduleTitle: null,
    partIndex: null,
    ordinal: 0,
    text: humanize(entryName),
  };
}

async function extractZip(buf: Buffer): Promise<ChunkRow[]> {
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

    const chunks = chunkText(extracted.text);
    chunks.forEach((text, ordinal) => {
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

// ---------------------------------------------------------------
// Telegram download (free Bot API, < 20 MB)
// ---------------------------------------------------------------

async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set — add it to apps/api/.env to download files');
  }
  const metaRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  const meta = (await metaRes.json()) as {
    ok: boolean;
    description?: string;
    result?: { file_path?: string; file_size?: number };
  };
  if (!meta.ok || !meta.result?.file_path) {
    throw new Error(meta.description || 'getFile failed');
  }
  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${meta.result.file_path}`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!fileRes.ok) throw new Error(`file download → HTTP ${fileRes.status}`);
  return Buffer.from(await fileRes.arrayBuffer());
}

// ---------------------------------------------------------------
// Database writes
// ---------------------------------------------------------------

async function writeLinkChunks(linkId: string, courseId: string, rows: ChunkRow[], replaceKinds: string[]) {
  const data = rows
    .filter((r) => r.text.trim())
    .map((r) => ({
      courseId,
      linkId,
      sourceKind: r.sourceKind,
      sourceName: r.sourceName,
      moduleTitle: r.moduleTitle,
      partIndex: r.partIndex,
      ordinal: r.ordinal,
      text: r.text,
      charCount: r.text.length,
      contentHash: hash(`${r.sourceName}\u0000${r.ordinal}\u0000${r.text}`),
    }));

  await prisma.$transaction([
    prisma.contentChunk.deleteMany({ where: { linkId, sourceKind: { in: replaceKinds } } }),
    ...(data.length ? [prisma.contentChunk.createMany({ data, skipDuplicates: true })] : []),
  ]);
  return data.length;
}

/** Index the module title and filename of every attachment. No download. */
async function indexNames(args: Args) {
  const links = await prisma.telegramCourseLink.findMany({
    where: args.course ? { course: { slug: args.course } } : {},
    orderBy: [{ moduleOrder: 'asc' }, { partIndex: 'asc' }],
    include: { course: { select: { id: true, slug: true } } },
    ...(args.limit ? { take: args.limit } : {}),
  });

  // Build every row first, then write once. One transaction per attachment
  // took minutes over Neon's network latency; one batched write takes seconds.
  const rows = links.flatMap((link) => {
    const label = humanize([link.moduleTitle, link.fileName].filter(Boolean).join(' — ') || link.id);
    const base = [
      {
        courseId: link.course.id,
        linkId: link.id,
        sourceKind: 'archive-name',
        sourceName: `archive:${link.fileName ?? link.id}`,
        moduleTitle: link.moduleTitle,
        partIndex: link.partIndex,
        ordinal: 0,
        text: label,
      },
      // The group/topic the file came from is a real subject signal.
      ...(link.chatUsername
        ? [
            {
              courseId: link.course.id,
              linkId: link.id,
              sourceKind: 'archive-name',
              sourceName: `archive-topic:${link.chatUsername}:${link.id}`,
              moduleTitle: link.moduleTitle,
              partIndex: link.partIndex,
              ordinal: 0,
              text: `${link.chatUsername} ${link.moduleTitle ?? ''} ${humanize(link.fileName ?? '')}`.trim(),
            },
          ]
        : []),
    ];
    return base
      .filter((r) => r.text.trim())
      .map((r) => ({
        ...r,
        charCount: r.text.length,
        contentHash: hash(`${r.sourceName}\u0000${r.ordinal}\u0000${r.text}`),
      }));
  });

  if (args.dryRun) {
    console.log(`names: ${links.length} attachments, ${rows.length} chunks (dry run)`);
    return;
  }

  const courseIds = [...new Set(links.map((l) => l.course.id))];
  await prisma.$transaction([
    prisma.contentChunk.deleteMany({
      where: { courseId: { in: courseIds }, sourceKind: 'archive-name' },
    }),
    ...(rows.length ? [prisma.contentChunk.createMany({ data: rows, skipDuplicates: true })] : []),
  ]);

  console.log(`names: ${links.length} attachments, ${rows.length} chunks written`);
}

/** Download and extract text from files the free Bot API can serve. */
async function indexDownloads(args: Args) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const candidates = await prisma.telegramCourseLink.findMany({
    where: {
      ...(args.course ? { course: { slug: args.course } } : {}),
      fileId: { not: null },
      fileSizeMb: { lt: args.maxMb },
      ...(args.force ? {} : { indexStatus: { not: 'indexed' } }),
    },
    orderBy: [{ moduleOrder: 'asc' }, { partIndex: 'asc' }],
    include: { course: { select: { id: true, slug: true } } },
  });

  // Filter before limiting: a `take` on the candidate query would spend the
  // budget on the first N attachments, which are often audio with no text.
  const eligibleAll = candidates.filter((l) => {
    const ext = extOf(l.fileName ?? '');
    return ARCHIVE_EXTS.has(ext) || PDF_EXTS.has(ext) || DOCX_EXTS.has(ext) || TEXT_EXTS.has(ext);
  });
  const eligible = args.limit ? eligibleAll.slice(0, args.limit) : eligibleAll;
  const media = candidates.length - eligibleAll.length;

  console.log(
    `download: ${candidates.length} candidates under ${args.maxMb} MB, ` +
      `${eligibleAll.length} contain text` +
      (args.limit && eligible.length < eligibleAll.length ? ` (processing ${eligible.length})` : '') +
      `, ${media} are media and keep name-only indexing`,
  );

  if (!token && !args.dryRun) {
    console.error('TELEGRAM_BOT_TOKEN is not set. Add it to apps/api/.env, or use --dry-run.');
    return;
  }

  let ok = 0;
  let noText = 0;
  let failed = 0;
  let chunks = 0;

  for (const [i, link] of eligible.entries()) {
    const name = link.fileName ?? link.id;
    const prefix = `[${i + 1}/${eligible.length}] ${link.course.slug} · ${name}`;
    if (args.dryRun) {
      console.log(`${prefix} (${link.fileSizeMb?.toFixed(1)} MB)`);
      continue;
    }

    try {
      const buf = await downloadTelegramFile(link.fileId as string);
      const ext = extOf(name);
      const rows: ChunkRow[] = [];

      if (ARCHIVE_EXTS.has(ext)) {
        rows.push(...(await extractZip(buf)));
      } else {
        rows.push(nameChunk(name));
        const extracted = await extractFile(name, buf);
        if (extracted?.text.trim()) {
          chunkText(extracted.text).forEach((text, ordinal) => {
            rows.push({
              sourceKind: extracted.kind,
              sourceName: name,
              moduleTitle: link.moduleTitle,
              partIndex: link.partIndex,
              ordinal,
              text,
            });
          });
        }
      }

      const textRows = rows.filter((r) => r.sourceKind !== 'entry-name' && r.sourceKind !== 'archive-name');
      const trimmed = trimToBudget(rows);

      if (textRows.length === 0) {
        await prisma.telegramCourseLink.update({
          where: { id: link.id },
          data: {
            indexStatus: 'skipped',
            indexedAt: new Date(),
            indexError: 'no extractable text',
          },
        });
        noText++;
        console.log(`${prefix} → no text`);
        continue;
      }

      chunks += await writeLinkChunks(link.id, link.course.id, trimmed, [
        'subtitle', 'pdf', 'text', 'json', 'html', 'link', 'entry-name',
      ]);
      await prisma.telegramCourseLink.update({
        where: { id: link.id },
        data: { indexStatus: 'indexed', indexedAt: new Date(), indexError: null },
      });
      ok++;
      console.log(`${prefix} → ${textRows.length} text chunks`);
    } catch (err) {
      failed++;
      const message = (err as Error).message.slice(0, 400);
      await prisma.telegramCourseLink.update({
        where: { id: link.id },
        data: { indexStatus: 'failed', indexError: message },
      });
      console.error(`${prefix} → FAILED: ${message}`);
    }
  }

  console.log(
    `download: ${ok} indexed, ${noText} without text, ${failed} failed, ${chunks} chunks` +
      (args.dryRun ? ' (dry run)' : ''),
  );
}

/** Keep one pathological archive from exhausting the free database tier. */
function trimToBudget(rows: ChunkRow[]): ChunkRow[] {
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

async function printStats() {
  const byStatus = await prisma.telegramCourseLink.groupBy({
    by: ['indexStatus'],
    _count: { _all: true },
  });
  const chunks = await prisma.contentChunk.count();
  const totalChars = await prisma.contentChunk.aggregate({ _sum: { charCount: true } });
  const byKind = await prisma.contentChunk.groupBy({
    by: ['sourceKind'],
    _count: { _all: true },
  });

  console.log('attachments:', Object.fromEntries(byStatus.map((s) => [s.indexStatus, s._count._all])));
  console.log('chunks:', chunks, '· characters:', totalChars._sum.charCount ?? 0);
  console.log('by source:', Object.fromEntries(byKind.map((k) => [k.sourceKind, k._count._all])));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.stats) {
    await printStats();
    return;
  }
  if (args.names) await indexNames(args);
  if (args.download) await indexDownloads(args);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
