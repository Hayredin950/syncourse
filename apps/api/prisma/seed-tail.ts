/* eslint-disable no-console */
/**
 * seed-tail.ts — completes the catalog seed for tables that were missed when
 * the full seed was interrupted (flaky network). Never wipes: only inserts
 * rows that don't already exist. Safe to re-run.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Completing seed tail…');

  const demoPassword = await bcrypt.hash('demo1234', 10);

  // --- demo users -----------------------------------------------------
  let demo = await prisma.user.findUnique({ where: { email: 'demo@syncourse.app' } });
  if (!demo) {
    demo = await prisma.user.create({
      data: {
        name: 'Hayredin Demo',
        username: 'hayredin',
        email: 'demo@syncourse.app',
        passwordHash: demoPassword,
        isVerified: true,
        gender: 'Male',
        planType: 'premium',
        planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        telegramUsername: 'hayredin6180',
      },
    });
    console.log('  + demo user');
  }
  let second = await prisma.user.findUnique({ where: { email: 'selam@syncourse.app' } });
  if (!second) {
    second = await prisma.user.create({
      data: { name: 'Selam Test', username: 'selam_test', email: 'selam@syncourse.app', passwordHash: demoPassword, isVerified: true },
    });
    console.log('  + second user');
  }

  const courseIds = (await prisma.course.findMany({ select: { id: true }, orderBy: { publishedAt: 'asc' } })).map((c) => c.id);
  if (courseIds.length === 0) throw new Error('No courses — run the full seed first');
  const firstLessons = async (courseId: string) =>
    (await prisma.lesson.findMany({ where: { courseId }, orderBy: { orderIndex: 'asc' }, take: 5 })).map((l) => l.id);

  // --- library (saved + liked) -------------------------------------------
  if ((await prisma.savedCourse.count()) === 0) {
    await prisma.savedCourse.create({ data: { userId: demo.id, courseId: courseIds[2] } });
    await prisma.likedCourse.create({ data: { userId: demo.id, courseId: courseIds[1] } });
    console.log('  + saved/liked');
  }

  // --- collections -------------------------------------------------------
  if ((await prisma.collectionList.count()) === 0) {
    const list = await prisma.collectionList.create({
      data: { userId: demo.id, name: 'AI Starter Pack', description: 'Courses I want to finish this quarter', visibility: 'public' },
    });
    await prisma.collectionItem.create({ data: { listId: list.id, courseId: courseIds[0] } });
    await prisma.collectionItem.create({ data: { listId: list.id, courseId: courseIds[2] } });
    console.log('  + collection list');
  }

  // --- ratings + reviews + thread upvotes --------------------------------
  if ((await prisma.rating.count()) === 0) {
    await prisma.rating.createMany({
      data: [
        { userId: demo.id, courseId: courseIds[0], stars: 5 },
        { userId: second.id, courseId: courseIds[0], stars: 4 },
        { userId: second.id, courseId: courseIds[1], stars: 5 },
      ],
    });
    const review = await prisma.review.create({
      data: { userId: demo.id, courseId: courseIds[0], body: 'The n8n workflows are incredibly practical — I automated my whole content pipeline after this course. Highly recommended!', containsSpoilers: false },
    });
    await prisma.review.create({
      data: { userId: second.id, courseId: courseIds[0], body: 'Great intro to AI automation, though some sections could use more depth.', parentId: review.id },
    });
    await prisma.reviewUpvote.create({ data: { userId: second.id, reviewId: review.id } });
    await prisma.review.update({ where: { id: review.id }, data: { upvotes: { increment: 1 } } });
    await prisma.review.create({
      data: { userId: second.id, courseId: courseIds[0], body: 'Does this course cover OpenAI integrations too, or only open-source models?', containsSpoilers: false },
    });
    console.log('  + ratings + reviews + upvotes');
  }

  // --- notifications ------------------------------------------------------
  if ((await prisma.notification.count()) === 0) {
    const firstCourse = await prisma.course.findFirst({ orderBy: { publishedAt: 'asc' } });
    await prisma.notification.createMany({
      data: [
        { userId: demo.id, type: 'new_lesson', title: 'New lesson available', body: '“Deploying your automation” was just added to the AI automation course.', deepLink: `/courses/${firstCourse?.slug}` },
        { userId: demo.id, type: 'progress', title: '60% there!', body: "You're 60% through the AI automation course. Keep going!", deepLink: `/courses/${firstCourse?.slug}` },
        { userId: demo.id, type: 'system', title: 'Welcome to SynCourse', body: 'Thanks for joining — your learning journey starts here.', deepLink: '/' },
      ],
    });
    console.log('  + notifications');
  }

  // --- download events ------------------------------------------------------
  if ((await prisma.downloadEvent.count()) === 0) {
    const day = 24 * 60 * 60 * 1000;
    const l0 = await firstLessons(courseIds[0]);
    for (let i = 0; i < 40; i++) {
      await prisma.downloadEvent.create({
        data: {
          userId: i % 3 === 0 ? demo.id : null,
          lessonId: l0[i % 5],
          courseId: courseIds[0],
          quality: ['1080p', '720p', '480p'][i % 3],
          method: i % 4 === 0 ? 'bot' : 'app',
          createdAt: new Date(Date.now() - i * 18 * 60 * 60 * 1000),
        },
      });
    }
    await prisma.course.update({ where: { id: courseIds[0] }, data: { downloadCount: { increment: 40 } } });
    console.log('  + download events');
  }

  // --- trending queries -----------------------------------------------------
  if ((await prisma.trendingQuery.count()) === 0) {
    await prisma.trendingQuery.createMany({
      data: [
        { query: 'react', count: 214 },
        { query: 'n8n', count: 189 },
        { query: 'machine learning', count: 156 },
        { query: 'flutter', count: 121 },
        { query: 'docker', count: 98 },
        { query: 'langchain', count: 87 },
        { query: 'python', count: 76 },
        { query: 'full stack', count: 64 },
      ],
    });
    console.log('  + trending queries');
  }

  // --- app versions -----------------------------------------------------------
  if ((await prisma.appVersion.count()) === 0) {
    await prisma.appVersion.createMany({
      data: [
        { version: '0.1.1', releasedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), changelogMd: '- Discussion threads with upvotes\n- In-app notifications + Telegram reminders\n- Browse filter sheet (category / level / rating)\n- Lecturer & organization profile pages\n- Settings: link Telegram, manage sessions' },
        { version: '0.1.0', releasedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), changelogMd: '- Initial release\n- Home rails, browse, search, course detail, notes\n- My Learning, lists, reviews\n- Premium plans (ETB + USD)' },
      ],
    });
    console.log('  + app versions');
  }

  // --- legal documents --------------------------------------------------------
  if ((await prisma.legalDocument.count()) === 0) {
    await prisma.legalDocument.createMany({
      data: [
        { type: 'terms', version: '1.0', bodyMd: '# Terms of Service\n\nLast updated: 2026.\n\nSyncourse is a course discovery and learning service. By creating an account or buying a subscription you agree to these terms.\n\n1. **Your account** — one person per account, keep your access secure.\n2. **Premium** — sold as a fixed-length pass (1, 3 or 6 months). It does not renew automatically.\n3. **Refunds** — every purchase carries a 14-day money-back guarantee.\n4. **Acceptable use** — no scraping, no sharing accounts, no unlawful use.\n5. **Liability** — limited to the amount you paid in the twelve months before a claim.\n\nQuestions: message the support account on Telegram.' },
        { type: 'privacy', version: '1.0', bodyMd: '# Privacy Policy\n\nLast updated: 2026.\n\nWhat we collect: account details, payment records (order/amount/reference only — never card numbers or wallet keys), usage (courses watched, downloaded, searched, rated) and technical data (IP, device, timestamps).\n\nWe do not sell your personal information. Processors may include: payment verification providers, transactional email, hosting/CDN, and Telegram if you link an account.\n\nYour choices: you may request a copy, correction, or deletion of your data at any time.' },
        { type: 'refund', version: '1.0', bodyMd: '# Refund Policy\n\nEvery purchase is covered by a 14-day, no-questions-asked money-back guarantee. Message support with your email and payment reference (Telebirr transaction number or crypto invoice ID).\n\nAfter 14 days we still refund in full when the fault is ours: double charges, overcharges, or accounts closed without a Terms breach.\n\nCrypto refunds are sent as a new transaction; the network fee is deducted and the amount is valued in USD at refund time.' },
      ],
    });
    console.log('  + legal documents');
  }

  console.log('Seed tail complete ✅');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
