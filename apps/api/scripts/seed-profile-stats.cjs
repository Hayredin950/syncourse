/* eslint-disable @typescript-eslint/no-var-requires */
// Sets the demo user's settings/privacy and backdates some activity timestamps
// across the last 12 months so the profile Stats tab has realistic data.
// Idempotent: re-running only backdates rows that still have today's timestamp.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const demo = await p.user.findUnique({ where: { email: 'demo@syncourse.app' } });
  if (!demo) {
    console.log('demo user not found — skipping');
    return;
  }

  // settings + privacy
  await p.user.update({
    where: { id: demo.id },
    data: {
      settings: { autoplayNext: true, previewAutoplay: false },
      privacy: { watchHistory: 'everyone', reviews: 'friends', watchlist: 'everyone', likes: 'friends' },
    },
  });
  console.log('settings/privacy set for', demo.email);

  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  // --- backdate enrollments: spread across last 12 months ---
  const enrollments = await p.enrollment.findMany({ where: { userId: demo.id }, orderBy: { enrolledAt: 'asc' } });
  for (let i = 0; i < enrollments.length; i++) {
    const e = enrollments[i];
    const d = new Date(today);
    d.setUTCMonth(d.getUTCMonth() - (11 - Math.floor((i * 11) / Math.max(enrollments.length - 1, 1))));
    d.setUTCDate(2 + (i % 25));
    await p.enrollment.update({
      where: { id: e.id },
      data: {
        enrolledAt: d,
        updatedAt: e.status === 'completed' ? new Date(d.getTime() + 1000 * 60 * 60 * 24 * 14) : e.updatedAt,
      },
    });
  }
  console.log('backdated', enrollments.length, 'enrollments');

  // --- backdate ratings ---
  const ratings = await p.rating.findMany({ where: { userId: demo.id }, orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < ratings.length; i++) {
    const d = new Date(today);
    d.setUTCMonth(d.getUTCMonth() - (11 - Math.floor((i * 11) / Math.max(ratings.length - 1, 1))));
    d.setUTCDate(3 + (i % 24));
    await p.rating.update({ where: { id: ratings[i].id }, data: { createdAt: d } });
  }
  console.log('backdated', ratings.length, 'ratings');

  // --- backdate reviews ---
  const reviews = await p.review.findMany({ where: { userId: demo.id, parentId: null }, orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < reviews.length; i++) {
    const d = new Date(today);
    d.setUTCMonth(d.getUTCMonth() - (11 - Math.floor((i * 11) / Math.max(reviews.length - 1, 1))));
    d.setUTCDate(5 + (i % 20));
    await p.review.update({ where: { id: reviews[i].id }, data: { createdAt: d } });
  }
  console.log('backdated', reviews.length, 'reviews');

  // --- backdate saved/liked courses for watchlist growth ---
  const saved = await p.savedCourse.findMany({ where: { userId: demo.id }, orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < saved.length; i++) {
    const d = new Date(today);
    d.setUTCMonth(d.getUTCMonth() - (11 - Math.floor((i * 11) / Math.max(saved.length - 1, 1))));
    d.setUTCDate(6 + (i % 18));
    await p.savedCourse.update({
      where: { userId_courseId: { userId: demo.id, courseId: saved[i].courseId } },
      data: { createdAt: d },
    });
  }
  console.log('backdated', saved.length, 'saved courses');

  // --- backdate downloads for the weekday rhythm ---
  const dl = await p.downloadEvent.findMany({ where: { userId: demo.id }, orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < dl.length; i++) {
    const d = new Date(today);
    d.setUTCMonth(d.getUTCMonth() - (11 - Math.floor((i * 11) / Math.max(dl.length - 1, 1))));
    d.setUTCDate(8 + (i % 15));
    d.setUTCHours(9 + (i % 10), (i * 7) % 60, 0, 0);
    await p.downloadEvent.update({ where: { id: dl[i].id }, data: { createdAt: d } });
  }
  console.log('backdated', dl.length, 'downloads');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
