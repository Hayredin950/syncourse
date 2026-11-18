/**
 * extract-check.ts — proves the Phase 4 archive reader without Telegram.
 *
 * Builds a small ZIP that looks like a course pack (video plus subtitles, notes,
 * HTML, JSON, a readme) and compares the streaming reader with the in-memory
 * one. The video entry is filled with a unique marker and may not appear in any
 * chunk: that is the whole promise of Phase 4.
 *
 *   npm run test:extract -w apps/api
 */
import AdmZip from 'adm-zip';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractZip, extractZipFromPath, trimToBudget } from './lib/text-extract';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

const VIDEO_MARKER = 'VIDEO-BYTES-MUST-NEVER-BE-READ';
const SRT = [
  '1',
  '00:00:01,000 --> 00:00:04,000',
  'Welcome to the course.',
  '',
  '2',
  '00:00:04,000 --> 00:00:08,000',
  '<i>Today we build a RAG pipeline.</i>',
  '',
].join('\n');

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'syncourse-extract-'));
  const zipPath = join(dir, 'course.zip');

  const zip = new AdmZip();
  // Two megabytes of "video" is enough to prove nothing reads it. Filled with
  // the marker so a byte-level leak would be obvious in the assertions.
  const video = Buffer.from(VIDEO_MARKER.repeat(Math.ceil((2 * 1024 * 1024) / VIDEO_MARKER.length)));
  zip.addFile('01 Intro/01 - Lesson.mp4', video);
  zip.addFile('01 Intro/01 - Lesson.srt', Buffer.from(SRT, 'utf8'));
  zip.addFile('01 Intro/notes.txt', Buffer.from('Install Docker first.\nThen run the compose file.', 'utf8'));
  zip.addFile('01 Intro/lesson.html', Buffer.from('<html><style>.x{}</style><p>Hello <b>world</b>, this paragraph is long enough to index.</p></html>', 'utf8'));
  zip.addFile('02 Automation/workflow.json', Buffer.from(JSON.stringify({ name: 'n8n flow', steps: 3 }), 'utf8'));
  zip.addFile('readme.md', Buffer.from('# Course pack\n\nEverything lives in the modules.', 'utf8'));
  zip.addFile('01 Intro/', Buffer.alloc(0)); // directory entry
  zip.writeZip(zipPath);

  try {
    console.log('extract: streaming reader');
    const rows = await extractZipFromPath(zipPath);

    const kinds = new Set(rows.map((r) => r.sourceKind));
    check('reads the subtitle', kinds.has('subtitle'), [...kinds]);
    check('reads plain notes', rows.some((r) => r.sourceName.endsWith('notes.txt')), [...kinds]);
    check('reads html as text', kinds.has('html'), [...kinds]);
    check('reads json', kinds.has('json'), [...kinds]);
    check('reads the readme', rows.some((r) => r.sourceName === 'readme.md'));

    check('indexes the video by name', rows.some((r) => r.sourceName.endsWith('.mp4') && r.sourceKind === 'entry-name'));
    check('no directory entries', rows.every((r) => !r.sourceName.endsWith('/')));
    check(
      'not one byte of the video leaks into a chunk',
      rows.every((r) => !r.text.includes(VIDEO_MARKER) && r.text.length < 100_000),
    );

    const subtitle = rows.find((r) => r.sourceKind === 'subtitle');
    check('subtitle timestamps are gone', !!subtitle && !subtitle.text.includes('-->') && !/\b00:00:0\d\b/.test(subtitle.text), subtitle?.text);
    check('subtitle dialogue survives', !!subtitle?.text.includes('RAG pipeline'), subtitle?.text);
    check('subtitle markup is stripped', !!subtitle && !subtitle.text.includes('<i>'), subtitle?.text);

    const html = rows.find((r) => r.sourceKind === 'html');
    check('html tags and styles are stripped', !!html && !html.text.includes('<') && html.text.includes('Hello world'), html?.text);

    const json = rows.find((r) => r.sourceKind === 'json');
    check('json is kept readable', !!json && json.text.includes('n8n flow'), json?.text.slice(0, 40));

    const notes = rows.find((r) => r.sourceName.endsWith('notes.txt') && r.sourceKind === 'text');
    check('notes keep their line breaks', !!notes && notes.text.includes('\n'), notes?.text);

    console.log('extract: parity with the in-memory path');
    const inMemory = await extractZip(await readFile(zipPath));
    const signature = (list: typeof rows) =>
      list
        .map((r) => `${r.sourceKind}:${r.sourceName}:${r.text}`)
        .sort()
        .join('\n');
    check('both readers produce the same chunks', signature(rows) === signature(inMemory));

    console.log('extract: budget');
    const capped = await extractZipFromPath(zipPath, { maxText: 40, maxChunks: 50 });
    const chars = capped.reduce((n, r) => n + r.text.length, 0);
    check('stops at the text budget', chars <= 40, chars);
    check('budget still yields a chunk', capped.length > 0, capped.length);

    const trimTarget = [
      { sourceKind: 'text', sourceName: 'a', moduleTitle: null, partIndex: null, ordinal: 0, text: 'x'.repeat(1_500_000) },
      { sourceKind: 'text', sourceName: 'b', moduleTitle: null, partIndex: null, ordinal: 0, text: 'y'.repeat(1_500_000) },
    ];
    const trimmed = trimToBudget(trimTarget);
    check(
      'trimToBudget keeps order and stops at the per-link cap',
      trimmed.length === 1 && trimmed[0].sourceName === 'a',
      trimmed.length,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  console.log(`\nextract: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
