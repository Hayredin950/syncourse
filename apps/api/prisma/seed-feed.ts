/* eslint-disable no-console */
/**
 * seed-feed.ts — imports the bundled Telegram sample feeds
 * (apps/api/prisma/sample-feeds/*.txt) into the catalog using the exact same
 * parser/importer as the /telegram-ingest API endpoints.
 *
 *     Category → Course → Section (module) → Lesson (part)
 *
 * Safe to re-run: courses are upserted by slug; content is rebuilt on each run.
 *
 *   npm run db:seed:feed -w apps/api
 *   DATABASE_URL=postgres://… npx ts-node prisma/seed-feed.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { buildFeed, parsePastedText } from '../src/telegram-ingest/telegram-feed.parser';
import { FeedImporter } from '../src/telegram-ingest/feed-importer';

const prisma = new PrismaClient();

const FEEDS = [
  {
    file: 'sample-feeds/zero-to-mastery.txt',
    username: 'zero_to_mastery',
    title: 'Zero To Mastery',
    categorySlugs: ['web-development'],
  },
  {
    file: 'sample-feeds/ai-and-machine-learning.txt',
    username: 'machine_learning_courses',
    title: 'AI and Machine Learning',
    categorySlugs: ['ai-and-machine-learning'],
  },
];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.FORCE_SEED !== '1') {
    console.error('Refusing to run seed-feed against NODE_ENV=production.');
    console.error('Use FORCE_SEED=1 to override, or point DATABASE_URL at a dev database.');
    process.exit(1);
  }

  const importer = new FeedImporter(prisma);
  let totalCourses = 0;
  let totalModules = 0;
  let totalParts = 0;

  for (const cfg of FEEDS) {
    const fp = path.join(__dirname, cfg.file);
    if (!fs.existsSync(fp)) {
      console.error(`Missing sample feed: ${fp}`);
      process.exit(1);
    }
    const text = fs.readFileSync(fp, 'utf8');
    const messages = parsePastedText(text);
    const feed = buildFeed(messages, { channelUsername: cfg.username, channelTitle: cfg.title });
    const res = await importer.importFeed(feed, {
      categorySlugs: cfg.categorySlugs,
      channelUsername: cfg.username,
      channelTitle: cfg.title,
    });

    console.log(`\n📡 ${cfg.title} (@${cfg.username})`);
    console.log(
      `  org: ${res.organization?.name ?? '-'} · courses created ${res.coursesCreated} · updated ${res.coursesUpdated}`,
    );
    console.log(
      `  modules ${res.sectionsCreated} · lessons ${res.lessonsCreated} · attachments ${res.attachmentsCreated} · lecturers ${res.lecturersCreated} · categories ${res.categoriesAssigned} · tg links ${res.telegramLinks}`,
    );
    for (const c of res.courses) {
      console.log(`    • ${c.title} — ${c.modules} modules · ${c.lessons} lessons`);
      totalCourses += 1;
      totalModules += c.modules;
      totalParts += c.lessons;
    }
  }

  console.log(`\n✅ Imported ${totalCourses} courses · ${totalModules} modules · ${totalParts} parts total.`);
  await printHierarchyTree();
}

/** Print a Category → Course → Section → Lesson sample so the hierarchy is visible. */
async function printHierarchyTree() {
  const cats = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      courses: {
        include: {
          course: {
            include: {
              sections: { orderBy: { orderIndex: 'asc' }, include: { lessons: { orderBy: { orderIndex: 'asc' } } } },
            },
          },
        },
      },
    },
  });

  console.log('\n🌳 Hierarchy preview (first 2 sections per course):');
  for (const cat of cats) {
    if (cat.courses.length === 0) continue;
    console.log(`\n${cat.icon} ${cat.name} — ${cat.courses.length} courses`);
    for (const cc of cat.courses.slice(0, 3)) {
      const c = cc.course;
      const lessons = c.sections.reduce((n, s) => n + s.lessons.length, 0);
      console.log(`  └─ 🎓 ${c.title} (${c.sections.length} modules · ${lessons} lessons)`);
      for (const s of c.sections.slice(0, 2)) {
        console.log(`       ├─ 📦 ${s.title}`);
        for (const l of s.lessons.slice(0, 2)) {
          console.log(`       │    └─ 🎬 ${l.title}`);
        }
        if (s.lessons.length > 2) console.log(`       │    └─ … +${s.lessons.length - 2} more parts`);
      }
      if (c.sections.length > 2) console.log(`       └─ … +${c.sections.length - 2} more modules`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
