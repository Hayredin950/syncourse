/**
 * recommend-check.ts — end-to-end check of the recommendation service.
 *
 *   npm run test:recommend -w apps/api
 *
 * It runs the real service against the real catalogue: a related rail for a
 * real course, the cold-start popular answer, and a temporary reader whose like
 * must shape "for you". The reader is deleted in `finally`, so their signals
 * disappear with them.
 *
 * The point of these checks is the promises the UI makes — no course in its own
 * "More like this", no course the reader already acted on in "For you", and no
 * recommendation that shares nothing with the anchor.
 */
import { PrismaClient } from '@prisma/client';
import { CatalogService } from '../src/catalog/catalog.service';
import { RecommendationsService } from '../src/recommendations/recommendations.service';
import { SearchService } from '../src/search/search.service';

const prisma = new PrismaClient();
const catalog = new CatalogService(prisma as never);
const recommendations = new RecommendationsService(prisma as never, catalog);
const search = new SearchService(prisma as never);

const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const TEST_EMAIL = `recommend-check-${STAMP}@example.invalid`;
const TEST_USERNAME = `recommend-check-${STAMP}`;
// Clicks are stored lowercased, so the probe has to be too.
const TEST_QUERY = `recommend-check-${STAMP}`.toLowerCase();

let passed = 0;
function ok(cond: boolean, name: string) {
  if (!cond) throw new Error(`FAILED: ${name}`);
  passed++;
  console.log(`  ✓ ${name}`);
}

async function cleanup() {
  await prisma.searchClick.deleteMany({ where: { query: TEST_QUERY } });
  // Signals, sessions and the user row go with the cascade.
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
}

/** The four things a course can share with an anchor. */
async function sharesSomething(a: string, b: string): Promise<boolean> {
  const [aRow, bRow] = await Promise.all([
    prisma.course.findUnique({
      where: { id: a },
      select: {
        levelId: true,
        categories: { select: { categoryId: true } },
        tags: { select: { tag: true } },
        lecturers: { select: { lecturerId: true } },
      },
    }),
    prisma.course.findUnique({
      where: { id: b },
      select: {
        levelId: true,
        categories: { select: { categoryId: true } },
        tags: { select: { tag: true } },
        lecturers: { select: { lecturerId: true } },
      },
    }),
  ]);
  if (!aRow || !bRow) return false;
  if (aRow.levelId && aRow.levelId === bRow.levelId) return true;
  const keys = (row: typeof aRow) => [
    ...row.categories.map((c) => `c:${c.categoryId}`),
    ...row.tags.map((t) => `t:${t.tag}`),
    ...row.lecturers.map((l) => `l:${l.lecturerId}`),
  ];
  const theirs = new Set(keys(bRow));
  return keys(aRow).some((key) => theirs.has(key));
}

async function main() {
  await cleanup();

  const anchor = await prisma.course.findFirst({
    where: {
      deletedAt: null,
      categories: { some: {} },
      tags: { some: {} },
    },
    orderBy: { downloadCount: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      categories: { select: { categoryId: true } },
    },
  });
  ok(Boolean(anchor), 'a catalogue course with categories exists');

  // --- related ------------------------------------------------------
  const related = await recommendations.similar(anchor!.slug, undefined, 8);
  ok(related.courses.length > 0, `related rail is not empty (${related.courses.length})`);
  ok(related.courses.length <= 8, 'related rail respects the limit');
  ok(related.courses.every((c) => c.slug !== anchor!.slug), 'the anchor is never in its own rail');
  ok(new Set(related.courses.map((c) => c.id)).size === related.courses.length, 'no duplicate cards');
  ok(
    related.courses.every((c) => Boolean(c.title && c.slug && typeof c.ratingAvg === 'number')),
    'cards carry the same shape as the rest of the site',
  );
  ok(related.source === 'related', `source is related (${related.source})`);

  // "More like this" is not padded with popular filler, so every card must
  // share something real with the anchor.
  const shared = await Promise.all(related.courses.map((c) => sharesSomething(anchor!.id, c.id)));
  ok(shared.every(Boolean), 'every related course shares a subject, level or lecturer');

  // --- cold start ---------------------------------------------------
  const cold = await recommendations.forYou(undefined, 10);
  ok(cold.source === 'popular', 'signed-out "for you" is the popular list');
  ok(cold.courses.length > 0, 'cold start is never empty');

  // --- personalised -------------------------------------------------
  const user = await prisma.user.create({
    data: {
      name: 'Recommendation Check',
      username: TEST_USERNAME,
      email: TEST_EMAIL,
      isVerified: true,
    },
    select: { id: true },
  });

  await prisma.likedCourse.create({ data: { userId: user.id, courseId: anchor!.id } });
  await prisma.savedCourse.create({ data: { userId: user.id, courseId: anchor!.id } });

  const personal = await recommendations.forYou(user.id, 10);
  ok(personal.courses.length > 0, 'personalised rail is not empty');
  ok(
    personal.courses.every((c) => c.id !== anchor!.id),
    'a course the reader already liked is not recommended back',
  );
  ok(personal.source === 'personalised', `source is personalised (${personal.source})`);

  const sameTopic = await Promise.all(personal.courses.slice(0, 5).map((c) => sharesSomething(anchor!.id, c.id)));
  ok(sameTopic.some(Boolean), 'at least one top pick is on the reader’s topic');

  // --- click learning ----------------------------------------------
  // Clear the like/save first: the next two checks are about clicks being a
  // signal on their own, and a profile with five likes in it would hide that.
  await prisma.likedCourse.deleteMany({ where: { userId: user.id } });
  await prisma.savedCourse.deleteMany({ where: { userId: user.id } });

  const clickTarget = await prisma.course.findFirst({
    where: {
      deletedAt: null,
      id: { not: anchor!.id },
      categories: { some: {} },
    },
    orderBy: { downloadCount: 'desc' },
    select: { id: true, title: true },
  });
  ok(Boolean(clickTarget), 'a second course is available as a click target');

  // A click on a fresh query must be stored, and a second click within the
  // window must be treated as the same visit.
  const first = await search.recordClick(TEST_QUERY, clickTarget!.id, user.id);
  const second = await search.recordClick(TEST_QUERY, clickTarget!.id, user.id);
  ok(first.recorded, 'first search click is stored');
  ok(!second.recorded, 'an immediate repeat is not a second vote');
  const stored = await prisma.searchClick.count({ where: { query: TEST_QUERY, userId: user.id } });
  ok(stored === 1, `exactly one click row (${stored})`);

  // Unknown ids must not throw — the reader is already navigating.
  const bogus = await search.recordClick(TEST_QUERY, 'not-a-real-course', user.id);
  ok(!bogus.recorded, 'a stale course id is ignored, not an error');

  // The click is also a taste signal: a signed-in reader with clicks alone
  // still gets a personalised list rather than the generic popular one.
  const fromClicks = await recommendations.forYou(user.id, 6);
  ok(fromClicks.courses.length > 0, 'clicks alone produce a recommendation');
  ok(fromClicks.source === 'personalised', `clicks alone score as personalised (${fromClicks.source})`);
  ok(
    fromClicks.courses.every((c) => c.id !== clickTarget!.id),
    'the clicked course is excluded from its own recommendations',
  );

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
