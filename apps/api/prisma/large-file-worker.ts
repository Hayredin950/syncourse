/**
 * large-file-worker.ts
 *
 * Phase 4: the attachments the free Bot API cannot serve (it refuses
 * `getFile` above 20 MB). 303 files sit in that band; the largest is 2.6 GB.
 *
 * This job logs into MTProto **as the same bot** and downloads one file at a
 * time, streams the text out of it, writes `ContentChunk` rows, and deletes the
 * temporary file. Video bytes are never stored or parsed, and nothing is kept on
 * disk after the file is done.
 *
 * It is built for GitHub Actions (unlimited minutes on a public repo, ~14 GB of
 * scratch disk) and is fully resumable: it selects `pending`/`failed` links,
 * processes a small batch, and each finished file is marked `indexed` in the
 * same transaction as its chunks. A killed run loses at most the file in flight.
 *
 * Requires (Actions secrets, never Vercel):
 *   DATABASE_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_API_ID, TELEGRAM_API_HASH
 *
 * Usage (from the repo root):
 *   npx tsx --env-file=apps/api/.env apps/api/prisma/large-file-worker.ts --dry-run
 *   npx tsx --env-file=apps/api/.env apps/api/prisma/large-file-worker.ts --limit 3
 *
 * Flags:
 *   --dry-run        list what would be processed; no network, no writes
 *   --limit <n>      files this run (default 5; keep the job under 6 h)
 *   --course <slug>  restrict to one course
 *   --min-mb <n>     lower size bound (default 19 — the Bot API ceiling)
 *   --max-mb <n>     upper size bound (default 1900; MTProto caps bots near 2 GB)
 *   --force          re-process files already marked indexed
 *   --stats          print the pending band and exit
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import bigInt from 'big-integer';
import { readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARCHIVE_EXTS,
  ChunkRow,
  chunkText,
  extractFile,
  extractZipFromPath,
  extOf,
  isTextBearing,
  nameChunk,
  trimToBudget,
} from './lib/text-extract';
import { writeLinkChunks } from './lib/chunk-store';

const prisma = new PrismaClient();

const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_MB = 19;
/** MTProto lets bots download up to 2 GB; 1900 MB leaves room for the header. */
const DEFAULT_MAX_MB = 1900;

interface Args {
  dryRun: boolean;
  stats: boolean;
  force: boolean;
  limit: number;
  minMb: number;
  maxMb: number;
  course?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    stats: false,
    force: false,
    limit: DEFAULT_LIMIT,
    minMb: DEFAULT_MIN_MB,
    maxMb: DEFAULT_MAX_MB,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--dry-run': args.dryRun = true; break;
      case '--stats': args.stats = true; break;
      case '--force': args.force = true; break;
      case '--limit': args.limit = Number(argv[++i]); break;
      case '--min-mb': args.minMb = Number(argv[++i]); break;
      case '--max-mb': args.maxMb = Number(argv[++i]); break;
      case '--course': args.course = argv[++i]; break;
      default:
        if (argv[i].startsWith('--')) throw new Error(`Unknown flag: ${argv[i]}`);
    }
  }
  if (!Number.isFinite(args.limit) || args.limit < 1) args.limit = DEFAULT_LIMIT;
  return args;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------
// Selection
// ---------------------------------------------------------------

function whereFor(args: Args, take?: number) {
  return {
    where: {
      ...(args.course ? { course: { slug: args.course } } : {}),
      fileId: { not: null },
      fileSizeMb: { gte: args.minMb, lte: args.maxMb },
      ...(args.force ? {} : { indexStatus: { not: 'indexed' } }),
    },
    // Smallest first: more files finished per run, and a failure early costs
    // less bandwidth.
    orderBy: [{ fileSizeMb: 'asc' as const }, { moduleOrder: 'asc' as const }],
    include: { course: { select: { id: true, slug: true } } },
    ...(take ? { take } : {}),
  };
}

async function printStats(args: Args) {
  const bands = await prisma.$queryRaw<Array<{ band: string; status: string; n: bigint }>>`
    SELECT CASE
             WHEN "fileSizeMb" >= ${args.maxMb} THEN 'too-big'
             WHEN "fileSizeMb" >= ${args.minMb} THEN 'large'
             ELSE 'small'
           END AS band,
           "indexStatus" AS status,
           count(*) AS n
    FROM "TelegramCourseLink"
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;
  for (const row of bands) {
    console.log(`${row.band.padEnd(8)} ${row.status.padEnd(8)} ${Number(row.n)}`);
  }
}

// ---------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------

async function connect(): Promise<TelegramClient> {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!Number.isFinite(apiId) || apiId <= 0) {
    throw new Error('TELEGRAM_API_ID is missing — add it to apps/api/.env and the Actions secrets');
  }
  if (!apiHash) throw new Error('TELEGRAM_API_HASH is missing');
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is missing');

  // An empty StringSession logs in fresh each run. Bot authorisations are not
  // invalidated by a new login, so this does not disturb the webhook.
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
    useWSS: true,
    autoReconnect: true,
    requestRetries: 5,
    floodSleepThreshold: 120,
  });

  await client.start({
    botAuthToken: botToken,
    onError: (err) => {
      throw err;
    },
  });
  return client;
}

/** Retry only the network step: a corrupt archive should fail, not loop. */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i === attempts) break;
      const wait = 3_000 * i;
      console.warn(`${label}: attempt ${i} failed (${(err as Error).message}); retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw last;
}

async function downloadToFile(
  client: TelegramClient,
  link: { chatId: bigint; fileMessageId: bigint },
  dest: string,
) {
  const ids = [Number(link.fileMessageId)];
  const messages = await client.getMessages(bigInt(link.chatId.toString()), { ids });
  const message = messages?.[0];
  if (!message || !message.media) {
    throw new Error('the message is gone or has no downloadable media');
  }

  let lastPct = -1;
  await client.downloadMedia(message, {
    outputFile: dest,
    progressCallback: (received, total) => {
      const pct = Number(total) > 0 ? Math.floor((Number(received) / Number(total)) * 100) : 0;
      if (pct >= lastPct + 25) {
        lastPct = pct;
        console.log(`    ${pct}% (${Math.round(Number(received) / 1024 / 1024)} MB)`);
      }
    },
  });

  const info = await stat(dest);
  if (info.size === 0) throw new Error('the download produced an empty file');
  return info.size;
}

// ---------------------------------------------------------------
// Processing
// ---------------------------------------------------------------

type LinkRow = Prisma.TelegramCourseLinkGetPayload<{
  include: { course: { select: { id: true; slug: true } } };
}>;

async function extractFromFile(link: LinkRow, filePath: string): Promise<ChunkRow[]> {
  const name = link.fileName ?? '';
  const ext = extOf(name);

  if (ARCHIVE_EXTS.has(ext)) {
    const rows = await extractZipFromPath(filePath);
    // Archive entries do not know their module; the attachment does.
    return rows.map((r) => ({ ...r, moduleTitle: link.moduleTitle, partIndex: link.partIndex }));
  }

  const buf = await readFile(filePath);
  const rows: ChunkRow[] = [nameChunk(name)];
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
  return rows;
}

async function processLink(client: TelegramClient, link: LinkRow): Promise<'indexed' | 'skipped' | 'failed'> {
  const name = link.fileName ?? link.id;
  const label = `${link.course.slug} · ${name} (${link.fileSizeMb?.toFixed(0) ?? '?'} MB)`;
  const ext = extOf(name);

  if (!isTextBearing(ext)) {
    // A video or an image at this size can only ever contribute its name,
    // which the names wave already indexed.
    await prisma.telegramCourseLink.update({
      where: { id: link.id },
      data: { indexStatus: 'skipped', indexedAt: new Date(), indexError: 'media only' },
    });
    console.log(`– ${label}: media only`);
    return 'skipped';
  }

  const dest = join(tmpdir(), `syncourse-${link.id}${ext ? `.${ext}` : '.bin'}`);
  try {
    console.log(`↓ ${label}`);
    const bytes = await withRetry('download', () => downloadToFile(client, link, dest));
    console.log(`  downloaded ${(bytes / 1024 / 1024).toFixed(0)} MB`);

    const rows = await extractFromFile(link, dest);
    const textRows = rows.filter((r) => r.sourceKind !== 'entry-name' && r.sourceKind !== 'archive-name');

    if (textRows.length === 0) {
      await prisma.telegramCourseLink.update({
        where: { id: link.id },
        data: { indexStatus: 'skipped', indexedAt: new Date(), indexError: 'no extractable text' },
      });
      console.log(`– ${label}: no text`);
      return 'skipped';
    }

    const written = await writeLinkChunks(prisma, link.id, link.course.id, trimToBudget(rows), [
      'subtitle', 'pdf', 'text', 'json', 'html', 'link', 'entry-name',
    ]);
    await prisma.telegramCourseLink.update({
      where: { id: link.id },
      data: { indexStatus: 'indexed', indexedAt: new Date(), indexError: null },
    });
    console.log(`✓ ${label}: ${textRows.length} text chunks, ${written} rows`);
    return 'indexed';
  } catch (err) {
    const message = (err as Error).message.slice(0, 400);
    await prisma.telegramCourseLink.update({
      where: { id: link.id },
      data: { indexStatus: 'failed', indexError: message },
    });
    console.error(`✗ ${label}: ${message}`);
    return 'failed';
  } finally {
    // The runner's disk is the scarce resource: a 1.9 GB file must not survive
    // its own job, even when extraction throws.
    await rm(dest, { force: true }).catch(() => undefined);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.stats) {
    await printStats(args);
    return;
  }

  const candidates = await prisma.telegramCourseLink.findMany(whereFor(args));
  const batch = candidates.slice(0, args.limit);

  const textBearing = batch.filter((l) => isTextBearing(extOf(l.fileName ?? '')));
  const media = batch.length - textBearing.length;
  console.log(
    `${candidates.length} pending file(s) between ${args.minMb} and ${args.maxMb} MB; ` +
      `processing ${batch.length}` +
      (media ? ` (${media} media-only)` : '') +
      (args.dryRun ? ' — dry run' : ''),
  );

  if (args.dryRun) {
    for (const l of batch) {
      console.log(`  ${l.course.slug} · ${l.fileName} (${l.fileSizeMb?.toFixed(1)} MB)`);
    }
    return;
  }

  const client = await connect();
  const tally = { indexed: 0, skipped: 0, failed: 0 };
  try {
    for (const [i, link] of batch.entries()) {
      console.log(`\n[${i + 1}/${batch.length}]`);
      tally[await processLink(client, link)]++;
    }
  } finally {
    await client.disconnect().catch(() => undefined);
  }

  console.log(
    `\ndone: ${tally.indexed} indexed, ${tally.skipped} skipped, ${tally.failed} failed. ` +
      'Re-run the workflow to continue with the next batch.',
  );
  if (tally.failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
