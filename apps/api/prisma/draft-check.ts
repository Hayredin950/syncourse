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
// The check never publishes a photo, so a resolver that returns null is enough.
const drafts = new IngestDraftService(prisma as never, {
  resolve: async () => null,
  resolveRoles: async () => ({}),
} as never);

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
  // Resources cascade their media, but not the Organisation they point at.
  await prisma.resource.deleteMany({ where: { title: { startsWith: MARK } } });
  // The fake chat id is unique to this script, which is a more reliable key
  // than a JSON path when a previous run used a different title.
  await prisma.ingestDraft.deleteMany({ where: { chatId: BigInt(CHAT_ID) } });
  await prisma.lecturer.deleteMany({
    where: { name: { in: ['Test Lecturer', 'Auto Lecturer'] } },
  });
  await prisma.organization.deleteMany({ where: { name: { startsWith: 'Test Org' } } });
  // Only the category this check invents; the built-in ones are untouched.
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'draftcheck' } } });
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

  // --- 8 — a post that carries every field publishes itself -----------------
  // Separate topic: a pending draft in the same topic would swallow the ZIP.
  const autoBase = { ...base, threadId: TOPIC_ID + 1 };
  const autoText =
    `🔰 ${TITLE} Auto\n` +
    `Taught By: Auto Lecturer\n` +
    `org: Test Org Auto\n` +
    `category: draftcheck-category\n` +
    `level: Wizardry\n` +
    `price: 19\n` +
    `⏱ 2 Hours\n` +
    `📦 8 Lessons\n` +
    `💰 Original Price: $29\n` +
    `#flutter\n` +
    `description: A complete description written for the check, long enough that the watcher has no reason to hold it back.\n` +
    `Download Full Course\n` +
    `https://t.me/syncourse/999021`;
  const autoDraft = await drafts.observe({
    ...autoBase,
    messageId: 999021,
    text: autoText,
    date: new Date(),
    file: null,
  });
  ok(autoDraft.action === 'announcement' && autoDraft.created, 'a complete post still opens a draft record');
  const autoId = autoDraft.action === 'announcement' ? autoDraft.draftId : '';
  ok(
    autoDraft.action === 'announcement' && autoDraft.payload.fields?.organizationName === 'Test Org Auto',
    'org line overrides the guessed organisation',
  );
  ok(
    autoDraft.action === 'announcement' && autoDraft.payload.fields?.price === 19,
    'price line overrides the parsed price',
  );

  // The ZIP is the last missing piece, so this observation publishes.
  const autoFile = await drafts.observe({
    ...autoBase,
    messageId: 999022,
    text: null,
    date: new Date(),
    file: {
      messageId: 999022,
      fileId: 'FILEID-AUTO-1',
      fileName: '1. Getting Started - Part 01.zip',
      fileSize: 80 * 1024 * 1024,
      mimeType: 'application/zip',
    },
  });
  ok(autoFile.action === 'published', 'a complete post publishes without a tap');
  const autoSlug = autoFile.action === 'published' ? autoFile.courseSlug : null;
  ok(Boolean(autoSlug), 'auto-publish reports the course slug');

  const autoCourse = await prisma.course.findUnique({
    where: { slug: autoSlug! },
    include: {
      organization: true,
      categories: { include: { category: true } },
      telegramFiles: true,
    },
  });
  ok(Boolean(autoCourse), 'auto-published course exists');
  ok(autoCourse?.price === 19, `price override reached the course (${autoCourse?.price})`);
  ok(autoCourse?.organization?.name === 'Test Org Auto', 'organisation created and linked');
  ok(autoCourse?.organization?.orgType === 'publisher', 'organisation type defaults to publisher');
  ok(
    Boolean(autoCourse?.categories.some((c) => c.category.slug === 'draftcheck-category')),
    'category line created and linked',
  );
  ok(autoCourse?.levelId === null, 'an unknown level is left unset rather than invented');
  ok(autoCourse?.telegramFiles.length === 1, 'the ZIP that triggered publishing is attached');

  // --- 9 — a late ZIP appends to the auto-published course ------------------
  const late = await drafts.observe({
    ...autoBase,
    messageId: 999023,
    text: null,
    date: new Date(),
    file: {
      messageId: 999023,
      fileId: 'FILEID-AUTO-2',
      fileName: '1. Getting Started - Part 02.zip',
      fileSize: 75 * 1024 * 1024,
      mimeType: 'application/zip',
    },
  });
  ok(late.action === 'published', 'a late ZIP is accepted by the published draft');
  ok(late.action === 'published' && late.draftId === autoId, 'the late ZIP joins the same draft');
  const autoLinks = await prisma.telegramCourseLink.count({ where: { courseId: autoCourse!.id } });
  ok(autoLinks === 2, `the late ZIP appended instead of duplicating (${autoLinks})`);
  const autoCourses = await prisma.course.count({ where: { slug: autoSlug! } });
  ok(autoCourses === 1, 'still exactly one course');

  // --- 10 — a resource post becomes a Resource, not a course ----------------
  const resourceBase = { ...base, threadId: TOPIC_ID + 2 };
  const resourceText =
    `resource: ${TITLE} Resource\n` +
    `A resource body that is comfortably longer than the sixty character gate, so it publishes itself.\n` +
    `org: Test Org Resource\n` +
    `category: draftcheck-resource`;
  const resourcePost = await drafts.observe({
    ...resourceBase,
    messageId: 999030,
    text: resourceText,
    date: new Date(),
    file: null,
  });
  ok(resourcePost.action === 'published', 'a complete resource publishes itself');
  const resourceSlug = resourcePost.action === 'published' ? resourcePost.courseSlug : null;
  const resource = resourceSlug
    ? await prisma.resource.findUnique({
        where: { slug: resourceSlug },
        include: { media: true, organization: true },
      })
    : null;
  ok(Boolean(resource), 'resource exists');
  ok(resource?.type === 'cheat-sheet', 'resource type defaults to cheat-sheet');
  ok((resource?.bodyMd ?? '').includes('comfortably longer'), 'resource body is the post body');
  ok(!(resource?.bodyMd ?? '').includes('org:'), 'field lines stay out of the resource body');
  ok(resource?.organization?.name === 'Test Org Resource', 'resource organisation linked');

  const resourceAttachment = await drafts.observe({
    ...resourceBase,
    messageId: 999031,
    text: null,
    date: new Date(),
    file: {
      messageId: 999031,
      fileId: 'FILEID-RES-1',
      fileName: 'shortcuts.pdf',
      fileSize: 2 * 1024 * 1024,
      mimeType: 'application/pdf',
    },
  });
  ok(resourceAttachment.action === 'published', 'a file joins the auto-published resource');
  const withMedia = resource
    ? await prisma.resource.findUnique({ where: { id: resource.id }, include: { media: true } })
    : null;
  ok(withMedia?.media.length === 1, `resource media attached (${withMedia?.media.length})`);
  ok(withMedia?.media[0]?.kind === 'pdf', 'attachment kind is derived from the mime type');

  // Re-posting the same file must not add a second row.
  const resourceDupe = await drafts.observe({
    ...resourceBase,
    messageId: 999032,
    text: null,
    date: new Date(),
    file: {
      messageId: 999032,
      fileId: 'FILEID-RES-1',
      fileName: 'shortcuts.pdf',
      fileSize: 2 * 1024 * 1024,
      mimeType: 'application/pdf',
    },
  });
  ok(resourceDupe.action === 'ignored', 'a re-posted resource file is ignored');
  const afterDupe = resource
    ? await prisma.resource.findUnique({ where: { id: resource.id }, include: { media: true } })
    : null;
  ok(afterDupe?.media.length === 1, 'media is still one row');

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
