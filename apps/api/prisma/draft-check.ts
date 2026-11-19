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
// The check never uploads a photo or a document, so a resolver that returns
// null is enough.
const drafts = new IngestDraftService(prisma as never, {
  resolve: async () => null,
  resolveMany: async (images: Array<{ fileId: string }>) => images.map(() => null),
  resolveRoles: async () => ({}),
  resolveFile: async () => null,
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
    where: { OR: [{ name: { in: ['Test Lecturer', 'Auto Lecturer'] } }, { name: { startsWith: MARK } }] },
  });
  await prisma.organization.deleteMany({ where: { name: { startsWith: 'Test Org' } } });
  // Only the category this check invents; the built-in ones are untouched.
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'draftcheck' } } });
}

/** A document posted after the announcement. */
function zip(messageId: number, fileName: string, sizeMb = 50) {
  return {
    messageId,
    fileId: `FILEID-${messageId}`,
    fileName,
    fileSize: sizeMb * 1024 * 1024,
    mimeType: fileName.toLowerCase().endsWith('.zip') ? 'application/zip' : 'application/epub+zip',
  };
}

/** A photo in a post or album. */
function photo(messageId: number, caption: string | null, fileId?: string) {
  return { messageId, fileId: fileId ?? `PHOTOID-${messageId}`, caption };
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

  // --- 11 — the `🔅` mini-course template, photo first, ZIP second ----------
  const miniBase = { ...base, threadId: TOPIC_ID + 3 };
  const handsOnText =
    `🔅 ${MARK} Hands-On AI: Building Your First LLM-Powered App\n\n` +
    `📝 Get started building apps powered by large language models (LLMs) in this hands-on, skills-based course for beginners.\n\n` +
    `🌐 Author: ${MARK} Han-chung Lee\n` +
    `🔰 Level: Beginner\n` +
    `⏰ Duration: 1h 14m\n\n` +
    `📋 Topics: AI Software Development, Large Language Models, Artificial Intelligence\n\n` +
    `🔗  Join Artificial intelligence (https://machine_learning_courses.t.me/) for more courses`;
  const handsOn = await drafts.observe({
    ...miniBase,
    messageId: 999040,
    text: handsOnText,
    date: new Date(),
    file: null,
    image: photo(999040, handsOnText),
  });
  ok(handsOn.action === 'announcement' && handsOn.created, '🔅 mini-course announcement opens a draft');
  const handsOnPayload = 'payload' in handsOn ? handsOn.payload : null;
  ok(handsOnPayload?.kind === 'course', 'the 🔅 template is a course, not a resource');
  ok(handsOnPayload?.fields?.contentType === 'mini-course', '1h 14m makes it a mini-course');
  ok(handsOnPayload?.announcement.durationMin === 74, 'duration 1h 14m is parsed as 74 minutes');
  ok(handsOnPayload?.announcement.lecturerNames[0] === `${MARK} Han-chung Lee`, '🌐 Author is the lecturer');
  ok(
    handsOnPayload?.announcement.description ===
      'Get started building apps powered by large language models (LLMs) in this hands-on, skills-based course for beginners.',
    '📝 description is extracted cleanly',
  );
  ok(
    !(handsOnPayload?.announcement.description ?? '').includes('Join') &&
      !(handsOnPayload?.announcement.description ?? '').includes('Topics:'),
    'promo and topics stay out of the description',
  );
  ok(handsOnPayload?.images?.[0]?.role === 'cover', 'the announcement photo is the cover');
  ok(
    (handsOnPayload?.files?.length ?? 0) === 0,
    'a mini-course waits for its ZIP instead of publishing empty',
  );

  const handsOnZip = await drafts.observe({
    ...miniBase,
    messageId: 999041,
    text: `📱Artificial intelligence (https://Machine_Learning_Courses.t.me/)\n📱${MARK} Hands-On AI: Building Your First LLM-Powered App`,
    date: new Date(),
    file: zip(999041, `${MARK} Hands-On AI - Building Your First LLM-Powered App.zip`, 167),
  });
  ok(handsOnZip.action === 'published', 'the mini-course publishes when its ZIP arrives');
  const handsOnSlug = handsOnZip.action === 'published' ? handsOnZip.courseSlug : null;
  const handsOnCourse = handsOnSlug
    ? await prisma.course.findUnique({
        where: { slug: handsOnSlug },
        include: { lecturers: { include: { lecturer: true } }, telegramFiles: true },
      })
    : null;
  ok(handsOnCourse?.contentType === 'mini-course', 'the published row is a mini-course');
  ok(handsOnCourse?.telegramFiles.length === 1, 'the ZIP is attached to the course');
  ok(handsOnCourse?.lecturers[0]?.lecturer.name === `${MARK} Han-chung Lee`, 'the author is credited');

  // --- 12 — the same template with a 41m duration ---------------------------
  const supplyBase = { ...base, threadId: TOPIC_ID + 4 };
  const supplyText =
    `🔅 ${MARK} The AI-Driven Supply Chain Manager\n\n` +
    `📝 Learn practical generative AI prompts to help you enhance the efficiency, accuracy, and sustainability of your supply chain.\n\n` +
    `🌐 Author: ${MARK} Daniel Stanton\n` +
    `🔰 Level: Beginner + Intermediate\n` +
    `⏰ Duration: 41m\n\n` +
    `📋 Topics: Supply Chain Management, Artificial Intelligence for Business\n\n` +
    `🔗  Join Artificial intelligence (https://machine_learning_courses.t.me/) for more courses`;
  const supply = await drafts.observe({
    ...supplyBase,
    messageId: 999050,
    text: supplyText,
    date: new Date(),
    file: null,
    image: photo(999050, supplyText),
  });
  const supplyPayload = 'payload' in supply ? supply.payload : null;
  ok(supplyPayload?.announcement.durationMin === 41, '41m is parsed as a duration');
  ok(supplyPayload?.fields?.contentType === 'mini-course', '41m is a mini-course');
  const supplyZip = await drafts.observe({
    ...supplyBase,
    messageId: 999051,
    text: null,
    date: new Date(),
    file: zip(999051, `${MARK} The AI-Driven Supply Chain Manager.zip`, 220),
  });
  ok(supplyZip.action === 'published', 'the 41m mini-course publishes itself');

  // --- 13 — the `🔰` template with price, rating and three ZIPs -------------
  const ultimateBase = { ...base, threadId: TOPIC_ID + 5 };
  const ultimateText =
    `🔰 ${MARK} Ultimate Web Development Course 2026 - Build Modern Websites\n\n` +
    `🌟 4.5 - 1646 votes  💰 Original Price: $19.99\n\n` +
    `📖 This is the only modern, always up-to-date Web Development course you will ever need.\n\n` +
    `🔊 Taught By: ${MARK} Haris Ali Khan\n\n` +
    `📤  Download Full Course (https://t.me/webdev_trainings/2300)    📤  Download All Courses (https://t.me/zero_to_mastery)`;
  const ultimate = await drafts.observe({
    ...ultimateBase,
    messageId: 999060,
    text: ultimateText,
    date: new Date(),
    file: null,
  });
  const ultimatePayload = 'payload' in ultimate ? ultimate.payload : null;
  ok(ultimatePayload?.announcement.ratingAvg === 4.5, '⭐ rating is read');
  ok(ultimatePayload?.announcement.ratingCount === 1646, 'vote count is read');
  ok(ultimatePayload?.announcement.originalPrice === 19.99, 'price is read');
  ok(ultimatePayload?.announcement.lecturerNames[0] === `${MARK} Haris Ali Khan`, '🔊 Taught By is the lecturer');
  ok(
    ultimatePayload?.announcement.description ===
      'This is the only modern, always up-to-date Web Development course you will ever need.',
    '📖 description is extracted cleanly',
  );
  ok((ultimatePayload?.confidence ?? 0) >= 0.85, `the 🔰 template is high confidence (${ultimatePayload?.confidence})`);
  ok(ultimatePayload?.fields?.contentType === 'course', 'a long course stays a course');
  ok(
    !(ultimatePayload?.announcement.description ?? '').includes('Download'),
    'the download stub is not the description',
  );

  let ultimatePublished: Awaited<ReturnType<typeof drafts.observe>> | null = null;
  for (const [i, name] of ['01 - Introduction.zip', '02 - HTML and CSS.zip', '03 - JavaScript.zip'].entries()) {
    ultimatePublished = await drafts.observe({
      ...ultimateBase,
      messageId: 999061 + i,
      text: null,
      date: new Date(),
      file: zip(999061 + i, name, 120),
    });
  }
  ok(ultimatePublished?.action === 'published', 'the 🔰 course publishes itself');
  const ultimateSlug = ultimatePublished?.action === 'published' ? ultimatePublished.courseSlug : null;
  const ultimateCourse = ultimateSlug
    ? await prisma.course.findUnique({
        where: { slug: ultimateSlug },
        include: { telegramFiles: true, lecturers: { include: { lecturer: true } } },
      })
    : null;
  ok(ultimateCourse?.contentType === 'course', 'a post that calls itself a course stays a course');
  ok(ultimateCourse?.telegramFiles.length === 3, 'all three ZIPs are attached');
  ok(ultimateCourse?.price === 19.99 && ultimateCourse?.originalPrice === 19.99, 'the price reaches the course');

  // --- 14 — a 20-part course: mini-course first, full course after four ------
  const hackingBase = { ...base, threadId: TOPIC_ID + 6 };
  const hackingText =
    `🔰 ${MARK} Complete Ethical Hacking Bootcamp\n\n` +
    `🌟 4.6 - 18169 votes  💰 Original Price: $74.99\n\n` +
    `📖 Learn Ethical Hacking + Penetration Testing! Use real techniques by black hat hackers then learn to defend against them!\n\n` +
    `🔊 Taught By: ${MARK} Andrei Neagoie, ${MARK} Aleksa Tamburkovski\n\n` +
    `📤  Download Full Course (https://t.me/LinuxMastery/529)    📤  Download All Courses (https://t.me/zero_to_mastery)`;
  const hacking = await drafts.observe({
    ...hackingBase,
    messageId: 999070,
    text: hackingText,
    date: new Date(),
    file: null,
  });
  const hackingPayload = 'payload' in hacking ? hacking.payload : null;
  ok(hackingPayload?.announcement.lecturerNames.length === 2, 'two teachers are read from one line');
  ok(hackingPayload?.files.length === 0, 'a course with no files waits');

  const hackingParts = [
    '01 - Introduction.zip',
    '02 - Setting Up Our Hacking Lab - Part 01.zip',
    '02 - Setting Up Our Hacking Lab - Part 02.zip',
    '03 - Linux Operating System.zip',
  ];
  let hackingPublished: Awaited<ReturnType<typeof drafts.observe>> | null = null;
  for (const [i, name] of hackingParts.entries()) {
    hackingPublished = await drafts.observe({
      ...hackingBase,
      messageId: 999071 + i,
      text: null,
      date: new Date(),
      file: zip(999071 + i, name, 80),
    });
  }
  ok(hackingPublished?.action === 'published', 'the multi-part course keeps publishing');
  const hackingSlug = hackingPublished?.action === 'published' ? hackingPublished.courseSlug : null;
  const hackingCourse = hackingSlug
    ? await prisma.course.findUnique({
        where: { slug: hackingSlug },
        include: { telegramFiles: { orderBy: [{ moduleOrder: 'asc' }, { partIndex: 'asc' }] } },
      })
    : null;
  ok(hackingCourse?.telegramFiles.length === 4, 'every part reached the course');
  ok(hackingCourse?.contentType === 'course', 'more than three parts upgrades the row to a full course');
  ok(
    (hackingCourse?.telegramFiles.filter((f) => (f.moduleTitle ?? '').includes('Setting Up Our Hacking Lab')).length ?? 0) === 2,
    'two parts of one module share its title',
  );

  // --- 15 — a titled picture that later receives ZIPs becomes a course ------
  const dlBase = { ...base, threadId: TOPIC_ID + 7 };
  const deepLearning = await drafts.observe({
    ...dlBase,
    messageId: 999080,
    text: `📕 ${MARK} Deep Learning with TensorFlow`,
    date: new Date(),
    file: null,
    image: photo(999080, `📕 ${MARK} Deep Learning with TensorFlow`),
  });
  ok(deepLearning.action === 'published', 'a picture-only post publishes as a resource first');
  const dlResourceSlug = deepLearning.action === 'published' ? deepLearning.courseSlug : null;
  let deepPublished: Awaited<ReturnType<typeof drafts.observe>> | null = null;
  for (const [i, name] of ['01. Introduction.zip', '02. Classifying on the MNIST Dataset.zip', '03. Business Case.zip'].entries()) {
    deepPublished = await drafts.observe({
      ...dlBase,
      messageId: 999081 + i,
      text: null,
      date: new Date(),
      file: zip(999081 + i, name, 140),
    });
  }
  ok(deepPublished?.action === 'published', 'ZIPs convert the fresh picture post into a course');
  const deepSlug = deepPublished?.action === 'published' ? deepPublished.courseSlug : null;
  const deepCourse = deepSlug
    ? await prisma.course.findUnique({
        where: { slug: deepSlug },
        include: { telegramFiles: true },
      })
    : null;
  ok(Boolean(deepCourse), 'the upgraded course exists');
  ok(deepCourse?.title === `${MARK} Deep Learning with TensorFlow`, 'the picture title becomes the course title');
  ok(deepCourse?.telegramFiles.length === 3, 'the three module ZIPs are attached');
  ok(deepCourse?.contentType === 'mini-course', 'three module ZIPs read as a mini-course');
  const dlResourceLeft = dlResourceSlug
    ? await prisma.resource.count({ where: { slug: dlResourceSlug } })
    : 0;
  ok(dlResourceLeft === 0, 'the temporary resource was removed when it became a course');

  // --- 16 — a book post: cover, description, source link, then the epub -----
  const bookBase = { ...base, threadId: TOPIC_ID + 8 };
  const illustratedText =
    `📚 ${MARK} An Illustrated Guide to AI Agents\n\n` +
    `Artificial intelligence is entering a new phase. AI agents can now reason, plan, and act with increasing independence.\n\n` +
    `🌐 Website (https://www.oreilly.com/library/view/an-illustrated-guide/9798341662681/)`;
  const illustrated = await drafts.observe({
    ...bookBase,
    messageId: 999090,
    text: illustratedText,
    date: new Date(),
    file: null,
    image: photo(999090, illustratedText),
  });
  ok(illustrated.action === 'published', 'a book announcement publishes as a resource');
  const illustratedSlug = illustrated.action === 'published' ? illustrated.courseSlug : null;
  const epub = await drafts.observe({
    ...bookBase,
    messageId: 999091,
    text: null,
    date: new Date(),
    file: zip(999091, `${MARK} An Illustrated Guide to AI Agents.epub`, 4),
  });
  ok(epub.action === 'published', 'the epub joins the published resource');
  const illustratedRow = illustratedSlug
    ? await prisma.resource.findUnique({ where: { slug: illustratedSlug }, include: { media: true } })
    : null;
  ok(illustratedRow?.title === `${MARK} An Illustrated Guide to AI Agents`, 'the book title is kept');
  ok((illustratedRow?.bodyMd ?? '').includes('new phase'), 'the description is the resource body');
  ok(illustratedRow?.sourceUrl === 'https://www.oreilly.com/library/view/an-illustrated-guide/9798341662681/', 'the external source link is kept, not a Telegram invite');
  ok(illustratedRow?.media.length === 2, 'the cover and the epub are both attached');
  ok(
    Boolean(illustratedRow?.media.some((m) => m.kind === 'image') && illustratedRow?.media.some((m) => m.kind === 'doc')),
    'media kinds are image + doc',
  );

  // --- 17 — a text-only note publishes as a note ----------------------------
  const noteBase = { ...base, threadId: TOPIC_ID + 9 };
  const termsText =
    `🤖 ${MARK} IMPORTANT AI TERMS & TOOLS YOU SHOULD KNOW 🧠\n\n` +
    `If you want to understand modern AI better, these are some of the most important terms and tools to know.\n\n` +
    `🧠 1. Generative AI\n\nAI that can create new content such as text, images, audio, video and code.\n\n` +
    `🔎 8. RAG\n\nRAG stands for Retrieval-Augmented Generation. It allows an AI system to retrieve relevant information from external sources and use it when generating an answer.`;
  const terms = await drafts.observe({
    ...noteBase,
    messageId: 999100,
    text: termsText,
    date: new Date(),
    file: null,
  });
  ok(terms.action === 'published', 'a long text post publishes as a resource');
  const termsSlug = terms.action === 'published' ? terms.courseSlug : null;
  const termsRow = termsSlug
    ? await prisma.resource.findUnique({ where: { slug: termsSlug }, include: { media: true } })
    : null;
  ok(termsRow?.type === 'note', 'a long text post is a note');
  ok(termsRow?.title === `${MARK} IMPORTANT AI TERMS & TOOLS YOU SHOULD KNOW`, 'the trailing emoji is dropped from the title');
  ok((termsRow?.bodyMd ?? '').includes('Retrieval-Augmented Generation'), 'the whole text is the body');

  // --- 18 — a four-photo album is one resource with four pictures -----------
  const albumBase = { ...base, threadId: TOPIC_ID + 10 };
  const albumCaption =
    `${MARK} Machine Learning vs. Deep Learning\n\n` +
    `🤖 Machine Learning: Requires engineered features + clean data.\n` +
    `🧠 Deep Learning: Takes raw data and learns features end-to-end via hidden layers.`;
  const albumFirst = await drafts.observe({
    ...albumBase,
    messageId: 999110,
    text: albumCaption,
    date: new Date(),
    file: null,
    image: photo(999110, albumCaption),
    mediaGroupId: 'ALBUM-1',
  });
  ok(albumFirst.action === 'published', 'an album caption post publishes itself');
  const albumSlug = albumFirst.action === 'published' ? albumFirst.courseSlug : null;
  for (let i = 1; i < 4; i++) {
    await drafts.observe({
      ...albumBase,
      messageId: 999110 + i,
      text: null,
      date: new Date(),
      file: null,
      image: photo(999110 + i, null),
      mediaGroupId: 'ALBUM-1',
    });
  }
  const albumRow = albumSlug
    ? await prisma.resource.findUnique({ where: { slug: albumSlug }, include: { media: true } })
    : null;
  ok(albumRow?.title === `${MARK} Machine Learning vs. Deep Learning`, 'the album title is the caption');
  ok(albumRow?.media.length === 4, `all four album frames are attached (${albumRow?.media.length})`);
  ok(Boolean(albumRow?.media.every((m) => m.kind === 'image')), 'every album frame is an image');

  // --- 19 — an album mixing photos and a video ------------------------------
  const mixedBase = { ...base, threadId: TOPIC_ID + 11 };
  const comotionCaption =
    `${MARK} CoMotion: simultaneous motion tracking of multiple people in video.\n\n` +
    `CoMotion is a method developed by Apple for the simultaneous 3D motion tracking of multiple people; it differs fundamentally from frame-by-frame detection and classical tracking techniques. It tracks people who overlap or temporarily disappear from view.`;
  const mixedFirst = await drafts.observe({
    ...mixedBase,
    messageId: 999120,
    text: comotionCaption,
    date: new Date(),
    file: null,
    image: photo(999120, comotionCaption),
    mediaGroupId: 'ALBUM-2',
  });
  ok(mixedFirst.action === 'published', 'the mixed album opens a resource');
  const mixedSlug = mixedFirst.action === 'published' ? mixedFirst.courseSlug : null;
  for (let i = 1; i < 5; i++) {
    await drafts.observe({
      ...mixedBase,
      messageId: 999120 + i,
      text: null,
      date: new Date(),
      file: null,
      image: photo(999120 + i, null),
      mediaGroupId: 'ALBUM-2',
    });
  }
  await drafts.observe({
    ...mixedBase,
    messageId: 999125,
    text: null,
    date: new Date(),
    file: { messageId: 999125, fileId: 'VIDEO-COMOTION', fileName: `${MARK} CoMotion demo.mp4`, fileSize: 30 * 1024 * 1024, mimeType: 'video/mp4' },
    mediaGroupId: 'ALBUM-2',
  });
  const mixedRow = mixedSlug
    ? await prisma.resource.findUnique({ where: { slug: mixedSlug }, include: { media: true } })
    : null;
  ok(mixedRow?.media.filter((m) => m.kind === 'image').length === 5, 'five photos are kept');
  ok(mixedRow?.media.filter((m) => m.kind === 'video').length === 1, 'the video is kept in the same post');

  // --- 20 — photo + audiobook + epub are one resource -----------------------
  const mollickBase = { ...base, threadId: TOPIC_ID + 12 };
  const mollick = await drafts.observe({
    ...mollickBase,
    messageId: 999130,
    text: `${MARK} Ethan Mollick - Co-Existence`,
    date: new Date(),
    file: null,
    image: photo(999130, `${MARK} Ethan Mollick - Co-Existence`),
  });
  ok(mollick.action === 'published', 'the book cover publishes as a resource');
  const mollickSlug = mollick.action === 'published' ? mollick.courseSlug : null;
  await drafts.observe({
    ...mollickBase,
    messageId: 999131,
    text: 'audiobook',
    date: new Date(),
    file: { messageId: 999131, fileId: 'AUDIO-MOL', fileName: `${MARK} Ethan Mollick - Co-Existence.mp3`, fileSize: 180 * 1024 * 1024, mimeType: 'audio/mpeg' },
  });
  await drafts.observe({
    ...mollickBase,
    messageId: 999132,
    text: null,
    date: new Date(),
    file: zip(999132, `${MARK} Ethan Mollick - Co-Existence.epub`, 3),
  });
  const mollickRow = mollickSlug
    ? await prisma.resource.findUnique({ where: { slug: mollickSlug }, include: { media: true } })
    : null;
  ok(mollickRow?.title === `${MARK} Ethan Mollick - Co-Existence`, 'the short audio caption does not rename the book');
  ok(mollickRow?.media.length === 3, `cover, audio and epub are attached (${mollickRow?.media.length})`);
  ok(
    Boolean(mollickRow?.media.some((m) => m.kind === 'audio') && mollickRow?.media.some((m) => m.kind === 'doc')),
    'media kinds include audio and doc',
  );

  // --- 21 — a captionless photo waits, then an album caption names it -------
  const placeholderBase = { ...base, threadId: TOPIC_ID + 13 };
  const placeholder = await drafts.observe({
    ...placeholderBase,
    messageId: 999140,
    text: null,
    date: new Date(),
    file: null,
    image: photo(999140, null),
    mediaGroupId: 'ALBUM-3',
  });
  ok(placeholder.action === 'announcement' && Boolean(placeholder.created), 'a captionless photo opens a placeholder draft');
  const placeholderPayload = 'payload' in placeholder ? placeholder.payload : null;
  ok(Boolean(placeholderPayload?.signals.includes('needs-title')), 'the placeholder is flagged for a human');
  const named = await drafts.observe({
    ...placeholderBase,
    messageId: 999141,
    text: `${MARK} 7 Layers of LLM Stack`,
    date: new Date(),
    file: null,
    image: photo(999141, `${MARK} 7 Layers of LLM Stack`),
    mediaGroupId: 'ALBUM-3',
  });
  ok(named.action === 'published', 'the album caption completes and publishes the post');
  const namedSlug = named.action === 'published' ? named.courseSlug : null;
  const namedRow = namedSlug
    ? await prisma.resource.findUnique({ where: { slug: namedSlug }, include: { media: true } })
    : null;
  ok(namedRow?.title === `${MARK} 7 Layers of LLM Stack`, 'the real caption replaces the placeholder title');
  ok(namedRow?.media.length === 2, 'both pictures stay in the post');

  // --- 22 — a text roadmap is a roadmap ------------------------------------
  const roadmapBase = { ...base, threadId: TOPIC_ID + 14 };
  const roadmapText =
    `${MARK} n8n Roadmap\n\n` +
    `1. Learn the editor and nodes\n` +
    `2. Learn expressions and data mapping\n` +
    `3. Learn error handling and retries\n` +
    `4. Build your first production workflow`;
  const roadmap = await drafts.observe({
    ...roadmapBase,
    messageId: 999150,
    text: roadmapText,
    date: new Date(),
    file: null,
  });
  ok(roadmap.action === 'published', 'a text roadmap publishes itself');
  const roadmapSlug = roadmap.action === 'published' ? roadmap.courseSlug : null;
  const roadmapRow = roadmapSlug
    ? await prisma.resource.findUnique({ where: { slug: roadmapSlug } })
    : null;
  ok(roadmapRow?.type === 'roadmap', 'the roadmap type is kept');
  ok((roadmapRow?.bodyMd ?? '').includes('production workflow'), 'all roadmap steps are kept');

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
