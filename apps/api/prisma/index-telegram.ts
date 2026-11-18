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
 *                  GitHub Actions worker (`large-file-worker.ts`).
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
 *
 * Text extraction itself lives in `lib/text-extract.ts` and is shared with the
 * large-file worker, so both waves read subtitles and PDFs identically.
 */
import { PrismaClient } from '@prisma/client';
import {
  ARCHIVE_EXTS,
  ChunkRow,
  DOCX_EXTS,
  PDF_EXTS,
  TEXT_EXTS,
  chunkText,
  extractFile,
  extractZip,
  extOf,
  hash,
  humanize,
  nameChunk,
  trimToBudget,
} from './lib/text-extract';
import { writeLinkChunks } from './lib/chunk-store';

const prisma = new PrismaClient();

/** The Bot API refuses `getFile` above 20 MB; 19 leaves a margin. */
const DEFAULT_MAX_MB = 19;

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
  const fileRes = await fetch(`https://api.telegram.org/bot${token}/${meta.result.file_path}`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!fileRes.ok) throw new Error(`file download → HTTP ${fileRes.status}`);
  return Buffer.from(await fileRes.arrayBuffer());
}

// ---------------------------------------------------------------
// Database writes
// ---------------------------------------------------------------

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

      chunks += await writeLinkChunks(prisma, link.id, link.course.id, trimmed, [
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
