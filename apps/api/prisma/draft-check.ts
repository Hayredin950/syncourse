/**
 * draft-check.ts — end-to-end check of the group watcher.
 *
 *   npm run test:drafts -w apps/api
 *
 * It simulates what the group does — an announcement, then two ZIP posts — and
 * runs the real service against the real schema: JSON payload, BigInt message
 * ids, the approval transaction, and the second-approval idempotency path.
 *
 * Everything it creates is prefixed with `[TEST]` and deleted in `finally`, so
 * a failed run cannot leave a fake course in the catalog. If a previous run was
 * killed before cleanup, pass `--cleanup` to remove the leftovers.
 */
import { PrismaClient } from '@prisma/client';
import { IngestDraftService } from '../src/telegram-ingest/draft.service';

const prisma = new PrismaClient();
const drafts = new IngestDraftService(prisma as never);

// The parser strips a leading non-alphanumeric run (that is how it drops a
// 🔰 emoji), so the marker must not start with punctuation.
const MARK = 'DraftCheck';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const TITLE = `${MARK} Watcher ${STAMP}`;
const CHAT_ID = -1009999999999;
const TOPIC_ID = 77;

let passed = 0;
function ok(cond: boolean, name: string) {
  if (!cond) throw new Error(`FAILED: ${name}`);
  passed++;
  console.log(`  ✓ ${name}`);
}

const announcementText =
  `🔰 ${TITLE}\n` +
  `Taught By: Test Lecturer\n` +
  `⏱ 3 Hours\n` +
  `📦 12 Lessons\n` +
  `💰 Original Price: $49\n` +
  `#python #machinelearning\n` +
  `Download Full Course\n` +
  `https://t.me/syncourse/999001`;

async function cleanup() {
  // Course first: its cascade removes the Telegram links.
  await prisma.course.deleteMany({ where: { title: { startsWith: MARK } } });
  // The fake chat id is unique to this script, which is a more reliable key
  // than a JSON path when a previous run used a different title.
  await prisma.ingestDraft.deleteMany({ where: { chatId: BigInt(CHAT_ID) } });
  await prisma.lecturer.deleteMany({ where: { name: 'Test Lecturer' } });
}

async function main() {
  if (process.argv.includes('--cleanup')) {
    await cleanup();
    console.log('leftovers removed');
    return;
  }

  await cleanup();

  const base = {
    chat: { id: CHAT_ID, type: 'supergroup', username: 'syncourse', title: 'Syncourse' },
    threadId: TOPIC_ID,
    from: { id: 111, username: 'tester', firstName: 'Test', isBot: false },
  };

  // 1 — announcement opens a draft
  const a = await drafts.observe({
    ...base,
    messageId: 999001,
    text: announcementText,
    date: new Date(),
    file: null,
  });
  ok(a.action === 'announcement', 'announcement creates a draft');
  if (a.action !== 'announcement') return;
  const draftId = a.draftId;
  ok(a.created, 'draft is new');
  ok(a.payload.announcement.title === TITLE, 'title parsed');
  ok(a.payload.confidence >= 0.8, `confidence ${a.payload.confidence}`);
  ok(a.payload.categorySlugs.includes('programming'), `categories: ${a.payload.categorySlugs.join(', ')}`);

  // 2 — Telegram redelivers the same update
  const again = await drafts.observe({
    ...base,
    messageId: 999001,
    text: announcementText,
    date: new Date(),
    file: null,
  });
  ok(again.action === 'announcement' && !again.created, 'redelivery does not duplicate the draft');
  ok(again.action === 'announcement' && again.draftId === draftId, 'redelivery resolves to the same draft');

  // 3 — two ZIPs join it, with module and part numbers read from the names
  const f1 = await drafts.observe({
    ...base,
    messageId: 999002,
    text: null,
    date: new Date(),
    file: {
      messageId: 999002,
      fileId: 'FILEID-A',
      fileName: '3. Data Cleaning - Part 01.zip',
      fileSize: 120 * 1024 * 1024,
      mimeType: 'application/zip',
    },
  });
  ok(f1.action === 'file', 'first ZIP attaches');
  ok(f1.action === 'file' && f1.payload.files[0].moduleTitle === '3. Data Cleaning', 'module from filename');

  const f2 = await drafts.observe({
    ...base,
    messageId: 999003,
    text: null,
    date: new Date(),
    file: {
      messageId: 999003,
      fileId: 'FILEID-B',
      fileName: '3. Data Cleaning - Part 02.zip',
      fileSize: 90 * 1024 * 1024,
      mimeType: 'application/zip',
    },
  });
  ok(f2.action === 'file' && f2.payload.files.length === 2, 'second ZIP attaches');
  ok(f2.action === 'file' && f2.payload.files[1].partIndex === 2, 'part index follows the name');

  // 4 — a re-posted file is ignored
  const dupe = await drafts.observe({
    ...base,
    messageId: 999004,
    text: null,
    date: new Date(),
    file: {
      messageId: 999004,
      fileId: 'FILEID-A2',
      fileName: '3. Data Cleaning - Part 01.zip',
      fileSize: 120 * 1024 * 1024,
      mimeType: 'application/zip',
    },
  });
  ok(dupe.action === 'ignored', 'duplicate file name + size is ignored');

  // 5 — approve writes the course
  const approved = await drafts.approve(draftId, { telegramId: 111 });
  ok(!approved.alreadyApproved, 'first approval writes');
  ok(approved.filesAdded === 2, `two files attached (${approved.filesAdded})`);
  ok(approved.modules === 1, `one module (${approved.modules})`);

  const course = await prisma.course.findUnique({
    where: { slug: approved.course!.slug },
    include: {
      telegramFiles: { orderBy: [{ moduleOrder: 'asc' }, { partIndex: 'asc' }] },
      lecturers: { include: { lecturer: true } },
      categories: { include: { category: true } },
    },
  });
  ok(Boolean(course), 'course exists');
  ok(course?.telegramFiles.length === 2, 'two Telegram links');
  ok(Boolean(course?.telegramFiles.every((f) => f.fileId !== null)), 'file ids kept for delivery');
  ok(course?.telegramFiles[0]?.partIndex === 1 && course?.telegramFiles[1]?.partIndex === 2, 'parts ordered');
  ok(course?.lecturers[0]?.lecturer.name === 'Test Lecturer', 'lecturer created and credited');
  ok((course?.categories.length ?? 0) > 0, 'categories linked');
  ok(course?.sourceUrl === 'https://t.me/syncourse/999001', 'source link kept');

  // 6 — approving twice must not duplicate
  const twice = await drafts.approve(draftId, { telegramId: 111 });
  ok(twice.alreadyApproved, 'second approval is a no-op');
  const links = await prisma.telegramCourseLink.count({ where: { courseId: course!.id } });
  ok(links === 2, 'still two links after a second approval');

  // 7 — discard stays on record
  const second = await drafts.observe({
    ...base,
    messageId: 999010,
    text: announcementText.replace(TITLE, `${TITLE} Two`),
    date: new Date(),
    file: null,
  });
  ok(second.action === 'announcement', 'second announcement drafts');
  if (second.action === 'announcement') {
    const discarded = await drafts.discard(second.draftId);
    ok(discarded.status === 'discarded', 'discard keeps the audit row');
    const reRun = await drafts.observe({
      ...base,
      messageId: 999010,
      text: announcementText.replace(TITLE, `${TITLE} Two`),
      date: new Date(),
      file: null,
    });
    ok(reRun.action === 'announcement' && !reRun.created, 'a discarded post is not proposed again');
  }

  console.log(`\n${passed} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error(`cleanup failed: ${(e as Error).message}`));
    await prisma.$disconnect();
  });
