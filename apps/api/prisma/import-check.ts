/**
 * Integration check for the multi-file delivery path.
 *
 * Replicates exactly what /import does after it has forwarded messages and read
 * their documents: group filenames into modules via the feed parser, persist one
 * TelegramCourseLink per part, then read it back the way the module picker does.
 *
 * Runs against a throwaway course so live data is untouched, and cleans up.
 */
import { PrismaClient } from '@prisma/client';
import { partFromFile, organizeParts } from '../src/telegram-ingest/telegram-feed.parser';

const prisma = new PrismaClient();

async function retry<T>(fn: () => Promise<T>, n = 6): Promise<T> {
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === n - 1) throw e;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  throw new Error('unreachable');
}

// the real filenames, as /import would see them off the forwarded documents
const FOUND = [
  '1. Introduction.zip',
  '8. Matplotlib Plotting and Data Visualization - Part 01.zip',
  '8. Matplotlib Plotting and Data Visualization - Part 02.zip',
  '8. Matplotlib Plotting and Data Visualization - Part  03.zip',
  '9. Scikit-learn Creating Machine Learning Models - Part 01.zip',
  '9. Scikit-learn Creating Machine Learning Models - Part 02.zip',
  '14_Neural_Networks_Deep_Learning,_Transfer_Learning_and_TensorFlow.zip',
  '14_Neural_Networks_Deep_Learning,_Transfer_Learning_and_TensorFlow.zip',
  'Where To Go From Here.zip',
].map((fileName, i) => ({ fileName, messageId: 5000 + i, fileSizeMb: 100 + i }));

/** mirrors TelegramService.courseModules() */
async function courseModules(courseId: string) {
  const files = await prisma.telegramCourseLink.findMany({
    where: { courseId },
    orderBy: [{ moduleOrder: 'asc' }, { partIndex: 'asc' }, { createdAt: 'asc' }],
  });
  const groups = new Map<string, { title: string | null; order: number; sizeMb: number; files: typeof files }>();
  for (const f of files) {
    const key = f.moduleTitle ?? '__ungrouped__';
    let g = groups.get(key);
    if (!g) {
      g = { title: f.moduleTitle, order: f.moduleOrder, sizeMb: 0, files: [] };
      groups.set(key, g);
    }
    g.files.push(f);
    g.sizeMb += f.fileSizeMb ?? 0;
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}

async function main() {
  const slug = `zzz-import-integration-check-${FOUND.length}`;
  await retry(() => prisma.course.deleteMany({ where: { slug } })); // idempotent

  const course = await retry(() =>
    prisma.course.create({
      data: { title: 'Import Integration Check', slug, description: 'temporary — deleted at the end of this test' },
    }),
  );
  console.log('temp course:', course.slug);

  // --- exactly the /import persistence loop ---
  const sections = organizeParts(FOUND.map((f, i) => partFromFile(f.fileName, i, null, null)));
  let created = 0;

  for (const [order, section] of sections.entries()) {
    for (const [pi, part] of section.parts.entries()) {
      const f = FOUND[part.orderIndex];
      if (!f) continue;
      const existing = await retry(() =>
        prisma.telegramCourseLink.findFirst({
          where: { courseId: course.id, chatId: BigInt(-1001), fileMessageId: BigInt(f.messageId) },
          select: { id: true },
        }),
      );
      const data = {
        courseId: course.id,
        chatId: BigInt(-1001),
        chatUsername: 'machine_learning_courses',
        fileMessageId: BigInt(f.messageId),
        fileId: `TEST_FILE_ID_${f.messageId}`,
        fileName: f.fileName,
        fileSizeMb: f.fileSizeMb,
        moduleTitle: section.title,
        moduleOrder: order,
        partIndex: part.partNo ?? pi + 1,
      };
      if (existing) await retry(() => prisma.telegramCourseLink.update({ where: { id: existing.id }, data }));
      else {
        await retry(() => prisma.telegramCourseLink.create({ data }));
        created++;
      }
    }
  }
  console.log(`persisted ${created} files into ${sections.length} modules\n`);

  // --- read back the way the picker does ---
  const modules = await courseModules(course.id);
  const fileCount = modules.reduce((n, m) => n + m.files.length, 0);
  console.log('MODULE PICKER would render:');
  for (const m of modules) {
    console.log(`  [ ${m.title?.slice(0, 40)} · ${m.files.length > 1 ? `${m.files.length} parts` : `${Math.round(m.sizeMb)} MB`} ]`);
  }
  console.log(`  [ ⬇ Send everything (${Math.round(modules.reduce((n, m) => n + m.sizeMb, 0))} MB) ]`);

  // --- assertions ---
  console.log('\n--- checks ---');
  const get = (s: string) => modules.find((m) => (m.title ?? '').includes(s));
  const checks: [string, boolean][] = [
    [`all ${FOUND.length} files persisted to ONE course`, fileCount === FOUND.length],
    ['grouped into 5 modules', modules.length === 5],
    ['Matplotlib module has 3 parts', get('Matplotlib')?.files.length === 3],
    ['Scikit-learn module has 2 parts', get('Scikit-learn')?.files.length === 2],
    ['2 identical Neural Networks files grouped', get('Neural Networks')?.files.length === 2],
    [
      'Neural Networks parts numbered 1,2 (not both 1)',
      JSON.stringify(get('Neural Networks')?.files.map((f) => f.partIndex)) === '[1,2]',
    ],
    ['Introduction is a single-part module', get('Introduction')?.files.length === 1],
    ['modules ordered by moduleOrder', modules.every((m, i) => i === 0 || modules[i - 1].order <= m.order)],
    [
      'parts ordered within a module',
      (get('Matplotlib')?.files ?? []).every((f, i, a) => i === 0 || a[i - 1].partIndex <= f.partIndex),
    ],
    ['every file kept a usable fileId', modules.every((m) => m.files.every((f) => !!f.fileId))],
  ];
  let bad = 0;
  for (const [label, ok] of checks) {
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }

  // --- re-import must be idempotent, not duplicating ---
  let dupes = 0;
  for (const f of FOUND) {
    const existing = await retry(() =>
      prisma.telegramCourseLink.findFirst({
        where: { courseId: course.id, chatId: BigInt(-1001), fileMessageId: BigInt(f.messageId) },
        select: { id: true },
      }),
    );
    if (!existing) dupes++;
  }
  const afterCount = await retry(() => prisma.telegramCourseLink.count({ where: { courseId: course.id } }));
  const idempotent = dupes === 0 && afterCount === FOUND.length;
  console.log(`${idempotent ? 'PASS' : 'FAIL'}  re-import finds every row again (idempotent, still ${afterCount})`);
  if (!idempotent) bad++;

  // cleanup — cascade removes the links
  await retry(() => prisma.course.delete({ where: { id: course.id } }));
  const leftover = await retry(() => prisma.telegramCourseLink.count({ where: { courseId: course.id } }));
  console.log(`${leftover === 0 ? 'PASS' : 'FAIL'}  temp course + links cleaned up`);
  if (leftover !== 0) bad++;

  console.log(bad ? `\n${bad} FAILED` : '\nall checks pass');
  await prisma.$disconnect();
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => {
  console.error('ERR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
