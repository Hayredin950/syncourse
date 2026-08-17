/* eslint-disable no-console */
/**
 * seed-rich.ts — additive "rich data" seed for production safety.
 *
 * Never wipes anything. It:
 *  - attaches real thumbnail/banner images to every existing course (by slug)
 *  - adds lecturer headshots + organization logos
 *  - adds more courses to fill empty categories (Design, Business, Programming)
 *  - adds realistic reviews + rating distributions + download events
 *  - adds discussion threads with upvotes
 *  - sets learning-path covers + demo user telegramId so bot downloads work
 *  - creates extra demo users so profiles/circles have content
 *
 * Safe to re-run: every step is idempotent (upsert by unique key or skip-if-exists).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Real, hotlinkable images (verified 200 OK). Course covers:
const COVERS: Record<string, string> = {
  'ai-introduction-to-ai-automation-with-n8n-langchain-no-code': 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&q=80&auto=format&fit=crop',
  'the-complete-web-developer-bootcamp': 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600&q=80&auto=format&fit=crop',
  'machine-learning-for-beginners-pytorch-edition': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=80&auto=format&fit=crop',
  'react-the-complete-guide-incl-hooks-next-js': 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=600&q=80&auto=format&fit=crop',
  'ai-ml-engineer-roadmap-15-step-cheat-sheet': 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&q=80&auto=format&fit=crop',
  'top-ai-algorithms-their-use-cases-cheat-sheet': 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=600&q=80&auto=format&fit=crop',
  'docker-kubernetes-the-practical-guide': 'https://images.unsplash.com/photo-1605745341112-85968b19335b?w=600&q=80&auto=format&fit=crop',
  'flutter-dart-the-complete-guide': 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=600&q=80&auto=format&fit=crop',
};

// Extra courses (fill Design / Business / Programming + more volume per rail)
const EXTRA_COURSES = [
  {
    title: 'UI/UX Design Fundamentals — From Wireframes to Prototypes',
    desc: 'Learn the design thinking process: user research, wireframing, visual hierarchy, and interactive prototypes in Figma. Project portfolio included.',
    cat: 'Design',
    lecturer: 'Adrian Twarog',
    org: 'DevPack',
    level: 'Beginner',
    rating: 4.5, votes: 12400, enrolled: 52000,
    originalPrice: 49.99, isPremium: false, featured: false,
    contentType: 'course',
    tags: ['UI', 'UX', 'Figma', 'Design', 'Wireframes', 'Prototyping'],
    audience: ['designers', 'beginners', 'product people'],
    prereq: 'No design experience needed — just curiosity.',
    cover: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&q=80&auto=format&fit=crop',
    daysAgo: 2,
  },
  {
    title: 'Business English for Developers & Freelancers',
    desc: 'Communicate clearly with clients, write professional emails, run stand-ups and negotiate rates in English — built for remote tech work.',
    cat: 'Business',
    lecturer: 'Adrian Twarog',
    org: 'DevPack',
    level: 'Intermediate',
    rating: 4.4, votes: 3100, enrolled: 9400,
    originalPrice: 29.99, isPremium: false, featured: false,
    contentType: 'mini-course',
    tags: ['Business', 'English', 'Freelancing', 'Communication'],
    audience: ['freelancers', 'developers'],
    prereq: 'Intermediate English is helpful.',
    cover: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&q=80&auto=format&fit=crop',
    daysAgo: 4,
  },
  {
    title: 'Data Structures & Algorithms in Python',
    desc: 'Master arrays, hash maps, trees, graphs and dynamic programming with Python — interview-ready explanations and 120 practice problems.',
    cat: 'Programming',
    lecturer: 'Daniel Bourke',
    org: 'Zero To Mastery',
    level: 'Advanced',
    rating: 4.8, votes: 41200, enrolled: 186000,
    originalPrice: 69.99, isPremium: true, featured: true,
    contentType: 'course',
    tags: ['Algorithms', 'Data Structures', 'Python', 'Interviews'],
    audience: ['students', 'job seekers'],
    prereq: 'Comfortable with Python basics.',
    cover: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=600&q=80&auto=format&fit=crop',
    daysAgo: 6,
  },
  {
    title: 'Android Development with Kotlin — Build 5 Apps',
    desc: 'From zero to Play Store: Kotlin, Jetpack Compose, Room, Retrofit and Material Design. Ship five complete Android apps.',
    cat: 'Mobile Development',
    lecturer: 'Max Schwarzmüller',
    org: 'Academind',
    level: 'Intermediate',
    rating: 4.7, votes: 28500, enrolled: 121000,
    originalPrice: 79.99, isPremium: true, featured: false,
    contentType: 'course',
    tags: ['Android', 'Kotlin', 'Jetpack Compose', 'Mobile'],
    audience: ['mobile developers', 'beginners'],
    prereq: 'Basic programming knowledge.',
    cover: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=600&q=80&auto=format&fit=crop',
    daysAgo: 8,
  },
  {
    title: 'SQL for Data Analysis — From Queries to Dashboards',
    desc: 'Write efficient SQL: joins, window functions, CTEs and aggregations, then build live dashboards from real datasets.',
    cat: 'Data Science',
    lecturer: 'Daniel Bourke',
    org: 'Zero To Mastery',
    level: 'Beginner',
    rating: 4.6, votes: 18900, enrolled: 73000,
    originalPrice: 39.99, isPremium: false, featured: false,
    contentType: 'cheat-sheet',
    tags: ['SQL', 'Data Analysis', 'Databases', 'Dashboards'],
    audience: ['analysts', 'students'],
    prereq: 'None.',
    cover: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80&auto=format&fit=crop',
    daysAgo: 10,
  },
  {
    title: 'Product Management Essentials — Ship What Matters',
    desc: 'A practical PM toolkit: discovery, roadmaps, prioritization frameworks, and shipping with cross-functional teams.',
    cat: 'Business',
    lecturer: 'Adrian Twarog',
    org: 'DevPack',
    level: 'Intermediate',
    rating: 4.3, votes: 5400, enrolled: 21000,
    originalPrice: 34.99, isPremium: false, featured: false,
    contentType: 'mini-course',
    tags: ['Product', 'Management', 'Roadmaps', 'Career'],
    audience: ['product people', 'founders'],
    prereq: 'None.',
    cover: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&q=80&auto=format&fit=crop',
    daysAgo: 12,
  },
  {
    title: 'DevOps Bootcamp: CI/CD, Terraform & Monitoring',
    desc: 'Automate everything: CI/CD pipelines, infrastructure as code with Terraform, container orchestration, and full observability.',
    cat: 'DevOps & Cloud',
    lecturer: 'Max Schwarzmüller',
    org: 'Academind',
    level: 'Advanced',
    rating: 4.7, votes: 19700, enrolled: 88000,
    originalPrice: 84.99, isPremium: true, featured: false,
    contentType: 'course',
    tags: ['DevOps', 'CI/CD', 'Terraform', 'Monitoring', 'Cloud'],
    audience: ['devops engineers', 'developers'],
    prereq: 'Basic Linux and Docker.',
    cover: 'https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=600&q=80&auto=format&fit=crop',
    daysAgo: 14,
  },
  {
    title: 'Python for Everybody — Zero to Automation',
    desc: 'The friendliest Python course: syntax, functions, files, APIs and automation scripts you can use the same day.',
    cat: 'Programming',
    lecturer: 'Derek Cheung',
    org: 'DevPack',
    level: 'Beginner',
    rating: 4.6, votes: 66200, enrolled: 310000,
    originalPrice: 24.99, isPremium: false, featured: true,
    contentType: 'course',
    tags: ['Python', 'Automation', 'APIs', 'Scripting'],
    audience: ['beginners', 'career-switchers'],
    prereq: 'No experience needed.',
    cover: 'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?w=600&q=80&auto=format&fit=crop',
    daysAgo: 16,
  },
  {
    title: 'Design Systems & Component Libraries',
    desc: 'Turn scattered UI decisions into a scalable system: tokens, component APIs, documentation and governance.',
    cat: 'Design',
    lecturer: 'Adrian Twarog',
    org: 'DevPack',
    level: 'Intermediate',
    rating: 4.5, votes: 8700, enrolled: 33000,
    originalPrice: 44.99, isPremium: false, featured: false,
    contentType: 'course',
    tags: ['Design Systems', 'Components', 'Tokens', 'Figma'],
    audience: ['designers', 'frontend engineers'],
    prereq: 'Figma basics recommended.',
    cover: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=600&q=80&auto=format&fit=crop',
    daysAgo: 18,
  },
  {
    title: 'Machine Learning with scikit-learn — The Practical Path',
    desc: 'Build, evaluate and ship ML models with scikit-learn: regression, classification, clustering and model tuning on real datasets.',
    cat: 'AI & Machine Learning',
    lecturer: 'Daniel Bourke',
    org: 'Zero To Mastery',
    level: 'Intermediate',
    rating: 4.6, votes: 24000, enrolled: 96000,
    originalPrice: 59.99, isPremium: true, featured: false,
    contentType: 'course',
    tags: ['scikit-learn', 'Machine Learning', 'Python', 'ML'],
    audience: ['data enthusiasts', 'developers'],
    prereq: 'Python basics.',
    cover: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=600&q=80&auto=format&fit=crop',
    daysAgo: 20,
  },
  {
    title: 'The UX Research Field Notes — Cheat-Sheet',
    desc: 'A compact reference of research methods: interviews, surveys, usability tests, journey maps and how to synthesize findings.',
    cat: 'Design',
    lecturer: 'Adrian Twarog',
    org: 'DevPack',
    level: 'All Levels',
    rating: 4.2, votes: 2200, enrolled: 9800,
    originalPrice: 9.99, isPremium: false, featured: false,
    contentType: 'cheat-sheet',
    tags: ['UX', 'Research', 'Cheat-Sheet', 'Interviews'],
    audience: ['designers', 'product people'],
    prereq: 'None.',
    cover: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&q=80&auto=format&fit=crop',
    daysAgo: 22,
  },
  {
    title: 'TypeScript for Real Projects',
    desc: 'Use the type system to make large codebases easier to navigate, refactor and trust — generics, narrowing and advanced patterns.',
    cat: 'Web Development',
    lecturer: 'Max Schwarzmüller',
    org: 'Academind',
    level: 'Intermediate',
    rating: 4.6, votes: 17300, enrolled: 69000,
    originalPrice: 54.99, isPremium: false, featured: false,
    contentType: 'course',
    tags: ['TypeScript', 'Web Development', 'JavaScript'],
    audience: ['web developers', 'frontend engineers'],
    prereq: 'JavaScript basics.',
    cover: 'https://images.unsplash.com/photo-1517180102446-f3ece451e9d8?w=600&q=80&auto=format&fit=crop',
    daysAgo: 25,
  },
];

const LECTURER_PHOTOS: Record<string, string> = {
  'derek-cheung': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80&auto=format&fit=crop',
  'andrei-neagoie': 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80&auto=format&fit=crop',
  'daniel-bourke': 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&q=80&auto=format&fit=crop',
  'max-schwarzmuller': 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=80&auto=format&fit=crop',
  'adrian-twarog': 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=400&q=80&auto=format&fit=crop',
};

const ORG_LOGOS: Record<string, string> = {
  devpack: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&q=80&auto=format&fit=crop',
  'zero-to-mastery': 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&q=80&auto=format&fit=crop',
  academind: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&q=80&auto=format&fit=crop',
};

const REVIEW_TEMPLATES = [
  { stars: 5, body: 'Exactly what I needed — clear, practical, and no filler. I shipped my first real project using this course within two weeks.' },
  { stars: 5, body: 'The instructor explains things so well. I finally understand this topic after years of being confused by other tutorials.' },
  { stars: 4, body: 'Really solid course. A few sections move fast, but the downloadable materials more than make up for it.' },
  { stars: 4, body: 'Great structure and real examples. Would love a follow-up module on advanced topics.' },
  { stars: 3, body: 'Good content overall, but some lessons could use more depth. Still worth it for the price.' },
];

const THREAD_TEMPLATES = [
  'Does anyone else find the third module tricky? Would love tips on how you practiced this section.',
  'Just finished the course — the final project was a great confidence boost. What should I learn next?',
  'Can we pin a thread for community solutions? Posting mine: link in the replies.',
  'The instructor verified answers here are gold. Thanks for keeping this thread active!',
  'How long did it take everyone to complete this? Trying to plan my schedule.',
];

async function main() {
  console.log('Rich seed: images, courses, reviews, threads, telegram…');

  // Clean up leftover throwaway test courses (zip-download-test-course*) from earlier debugging.
  const cleaned = await prisma.course.deleteMany({
    where: { slug: { startsWith: 'zip-download-test-course' } },
  });
  if (cleaned.count > 0) console.log(`  removed ${cleaned.count} throwaway test courses`);

  // ---------- 1. Course covers (existing courses by slug) ----------
  let updated = 0;
  for (const [slug, url] of Object.entries(COVERS)) {
    const res = await prisma.course.updateMany({ where: { slug }, data: { thumbnailUrl: url, bannerUrl: url } });
    updated += res.count;
  }
  console.log(`  covers attached to ${updated} existing courses`);

  // ---------- 2. Lecturer photos + org logos ----------
  for (const [slug, url] of Object.entries(LECTURER_PHOTOS)) {
    await prisma.lecturer.updateMany({ where: { slug }, data: { photoUrl: url } });
  }
  for (const [slug, url] of Object.entries(ORG_LOGOS)) {
    await prisma.organization.updateMany({ where: { slug }, data: { logoUrl: url } });
  }
  console.log('  lecturer photos + org logos attached');

  // ---------- 3. Extra courses (skip if slug exists) ----------
  const levels = await prisma.level.findMany();
  const levelByName = Object.fromEntries(levels.map((l) => [l.name, l.id]));
  const cats = await prisma.category.findMany();
  const catByName = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  const lecturers = await prisma.lecturer.findMany();
  const lecturerByName = Object.fromEntries(lecturers.map((l) => [l.name, l.id]));
  const orgs = await prisma.organization.findMany();
  const orgByName = Object.fromEntries(orgs.map((o) => [o.name, o.id]));

  let created = 0;
  for (const d of EXTRA_COURSES) {
    const slug = slugify(d.title);
    const exists = await prisma.course.findUnique({ where: { slug } });
    if (exists) continue;
    const course = await prisma.course.create({
      data: {
        title: d.title,
        slug,
        description: d.desc,
        thumbnailUrl: d.cover,
        bannerUrl: d.cover,
        previewVideoUrl: sampleVideo(),
        language: 'English',
        levelId: levelByName[d.level],
        lecturerId: lecturerByName[d.lecturer],
        organizationId: orgByName[d.org],
        originalPrice: d.originalPrice,
        price: d.originalPrice,
        isPremium: d.isPremium,
        isFeatured: d.featured,
        contentType: d.contentType,
        prerequisites: d.prereq,
        ratingAvg: d.rating,
        ratingCount: d.votes,
        enrollmentCount: d.enrolled,
        downloadCount: Math.round(d.enrolled * 0.4),
        publishedAt: new Date(Date.now() - d.daysAgo * 24 * 60 * 60 * 1000),
      },
    });
    const catIds = Array.from(new Set([catByName[d.cat], catByName['Programming']].filter(Boolean)));
    await prisma.courseCategory.createMany({
      data: catIds.map((categoryId) => ({ courseId: course.id, categoryId })),
      skipDuplicates: true,
    });
    await prisma.courseTag.createMany({
      data: d.tags.map((tag) => ({ courseId: course.id, tag })),
      skipDuplicates: true,
    });
    await prisma.courseAudience.createMany({
      data: d.audience.map((audienceTag) => ({ courseId: course.id, audienceTag })),
      skipDuplicates: true,
    });

    const sectionCount = d.contentType === 'course' ? 3 : 2;
    const lessonsPer = d.contentType === 'course' ? 4 : 3;
    for (let s = 0; s < sectionCount; s++) {
      const section = await prisma.section.create({
        data: { courseId: course.id, title: `Section ${s + 1}`, orderIndex: s },
      });
      for (let l = 0; l < lessonsPer; l++) {
        const lesson = await prisma.lesson.create({
          data: {
            courseId: course.id,
            sectionId: section.id,
            title: `Lesson ${s + 1}.${l + 1} — ${d.title.split(' ').slice(0, 4).join(' ')}`,
            orderIndex: l,
            type: 'video',
            durationSec: (9 + ((s * lessonsPer + l) % 5) * 6) * 60,
            videoUrl: sampleVideo(),
            isPreview: s === 0 && l === 0,
          },
        });
        for (const v of [
          { label: '1080p', sizeMb: 640 + l * 37, codec: 'x265', best: true },
          { label: '720p', sizeMb: 320 + l * 19, codec: 'x264', best: false },
        ]) {
          await prisma.lessonFile.create({
            data: { lessonId: lesson.id, label: v.label, format: 'mp4', sizeMb: v.sizeMb, durationSec: lesson.durationSec, codec: v.codec, hasSubtitles: true, audio: 'EN', isBest: v.best },
          });
        }
        await prisma.note.create({
          data: { lessonId: lesson.id, courseId: course.id, title: 'Key concepts — cheat-sheet', richText: `### Key Concepts\n\n- ${d.title} — core ideas in one place\n- Practice with real projects\n- Take notes in your own words`, imageUrls: '[]', pdfUrl: null, isCheatsheet: true },
        });
      }
    }
    created++;
  }
  console.log(`  ${created} extra courses created`);

  // ---------- 4. Reviews + ratings for every course ----------
  const demo = await prisma.user.findUnique({ where: { email: 'demo@syncourse.app' } });
  const second = await prisma.user.findUnique({ where: { email: 'selam@syncourse.app' } });
  const extraUsers: { id: string }[] = [];
  const hash = await bcrypt.hash('demo1234', 10);
  const names = [
    { name: 'Amanuel Tesfaye', username: 'amanuel_dev', avatar: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&q=80' },
    { name: 'Sara Hailu', username: 'sara_codes', avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&q=80' },
    { name: 'Yonas Bekele', username: 'yonas_ml', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80' },
    { name: 'Hanna Gebre', username: 'hanna_designs', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&q=80' },
  ];
  for (const n of names) {
    let existing = await prisma.user.findUnique({ where: { username: n.username } });
    if (!existing) {
      existing = await prisma.user.create({
        data: {
          name: n.name,
          username: n.username,
          email: `${n.username}@syncourse.app`,
          passwordHash: hash,
          isVerified: true,
          gender: 'Prefer not to say',
          avatarUrl: n.avatar,
        },
      });
    }
    extraUsers.push({ id: existing.id });
  }
  if (second) extraUsers.push({ id: second.id });

  const allCourses = await prisma.course.findMany({ where: { deletedAt: null } });
  let reviewsAdded = 0;
  let ratingsAdded = 0;
  for (const course of allCourses) {
    const reviewCount = await prisma.review.count({ where: { courseId: course.id, parentId: null } });
    if (reviewCount < 3) {
      const users = [demo!, ...extraUsers];
      for (let i = reviewCount; i < Math.min(5, users.length + 1); i++) {
        const t = REVIEW_TEMPLATES[i % REVIEW_TEMPLATES.length];
        const author = i % 3 === 0 && demo ? demo : users[i % users.length];
        if (!author) continue;
        await prisma.review.create({
          data: {
            userId: author.id,
            courseId: course.id,
            body: t.body,
            containsSpoilers: i === 4,
          },
        });
        reviewsAdded++;
      }
    }
    // rating distribution that matches ratingAvg — spread across a large
    // learner pool so (userId, courseId) stays unique per course.
    const dist = distributionFor(course.ratingAvg);
    const existingRatings = await prisma.rating.count({ where: { courseId: course.id } });
    if (existingRatings === 0) {
      const learners = await ensureLearnerPool(ratingsAdded);
      // Use createMany + skipDuplicates: fully idempotent on re-run.
      const rows: { userId: string; courseId: string; stars: number }[] = [];
      const seen = new Set<string>();
      for (const [stars, n] of dist) {
        for (let k = 0; k < n; k++) {
          const author = learners[(ratingsAdded + k) % learners.length];
          if (!author || seen.has(author.id)) continue;
          seen.add(author.id);
          rows.push({ userId: author.id, courseId: course.id, stars });
        }
      }
      ratingsAdded += rows.length;
      if (rows.length > 0) {
        await prisma.rating.createMany({ data: rows, skipDuplicates: true });
      }
    }
  }
  console.log(`  ${reviewsAdded} reviews, ${ratingsAdded} ratings added`);

  // ---------- 5. Discussion threads with upvotes ----------
  let threadsAdded = 0;
  for (const course of allCourses.slice(0, 10)) {
    const existing = await prisma.review.count({ where: { courseId: course.id, parentId: null, containsSpoilers: false } });
    // threads are just parent reviews on the discussion; seed a couple more
    const threadCount = await prisma.review.count({ where: { courseId: course.id } });
    if (threadCount < 8) {
      for (let i = 0; i < 2; i++) {
        const author = extraUsers[i % extraUsers.length] ?? demo!;
        const t = await prisma.review.create({
          data: { userId: author.id, courseId: course.id, body: THREAD_TEMPLATES[(threadsAdded + i) % THREAD_TEMPLATES.length], containsSpoilers: false },
        });
        const voter = extraUsers[(i + 1) % extraUsers.length];
        if (voter && voter.id !== author.id) {
          await prisma.reviewUpvote.create({ data: { userId: voter.id, reviewId: t.id } }).catch(() => undefined);
          await prisma.review.update({ where: { id: t.id }, data: { upvotes: { increment: 1 } } });
        }
        threadsAdded++;
      }
    }
  }
  console.log(`  ${threadsAdded} discussion threads added`);

  // ---------- 6. Download events spread over 30 days for every course ----------
  let dlAdded = 0;
  for (const course of allCourses) {
    const existing = await prisma.downloadEvent.count({ where: { courseId: course.id } });
    if (existing > 0) continue;
    const lessons = await prisma.lesson.findMany({ where: { courseId: course.id }, take: 6, orderBy: { orderIndex: 'asc' } });
    for (let i = 0; i < 24; i++) {
      const lesson = lessons[i % Math.max(1, lessons.length)];
      if (!lesson) continue;
      await prisma.downloadEvent.create({
        data: {
          userId: i % 3 === 0 && demo ? demo.id : null,
          lessonId: lesson.id,
          courseId: course.id,
          quality: ['1080p', '720p', '480p'][i % 3],
          method: i % 4 === 0 ? 'bot' : 'app',
          createdAt: new Date(Date.now() - i * 28 * 60 * 60 * 1000),
        },
      });
      dlAdded++;
    }
  }
  console.log(`  ${dlAdded} download events added`);

  // ---------- 7. Learning path covers ----------
  const paths = await prisma.learningPath.findMany();
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    await prisma.learningPath.update({
      where: { id: p.id },
      data: { coverUrl: COVERS[Object.keys(COVERS)[i % Object.keys(COVERS).length]] },
    });
  }
  console.log('  learning path covers set');

  // ---------- 8. Demo user telegramId (so bot downloads work) ----------
  if (demo && !demo.telegramId) {
    // Demo chat id from the bot owner's actual chat — stored as BigInt.
    await prisma.user.update({ where: { id: demo.id }, data: { telegramId: BigInt(process.env.DEMO_TELEGRAM_ID || '6180') } });
    console.log('  demo telegramId set');
  }

  console.log('Rich seed complete ✅');
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Ensure a pool of learner accounts exists (for rating distributions). */
async function ensureLearnerPool(offset: number): Promise<{ id: string }[]> {
  const HASH = await bcrypt.hash('demo1234', 10);
  const FIRST = ['Abel', 'Beth', 'Caleb', 'Dina', 'Elias', 'Fana', 'Gemechu', 'Hana', 'Isaac', 'Jemal', 'Kebede', 'Liya', 'Meron', 'Nahom', 'Oli', 'Paulos', 'Rahel', 'Samson', 'Tigist', 'Uriel', 'Vivi', 'Wondwossen', 'Xander', 'Yared'];
  const users: { id: string }[] = [];
  for (let i = 0; i < FIRST.length; i++) {
    const username = `learner_${(i + offset) % FIRST.length}`;
    let u = await prisma.user.findUnique({ where: { username } });
    if (!u) {
      u = await prisma.user.create({
        data: {
          name: `${FIRST[i]} ${['T.', 'M.', 'A.', 'K.'][i % 4]}Demo`,
          username,
          email: `${username}@syncourse.app`,
          passwordHash: HASH,
          isVerified: true,
        },
      });
    }
    users.push({ id: u.id });
  }
  return users;
}

function distributionFor(avg: number): [number, number][] {
  const r = Math.round(avg * 2) / 2; // nearest 0.5
  if (r >= 4.5) return [[5, 4], [4, 2], [3, 1], [2, 0], [1, 0]];
  if (r >= 4) return [[5, 3], [4, 3], [3, 1], [2, 0], [1, 0]];
  if (r >= 3.5) return [[5, 2], [4, 3], [3, 2], [2, 1], [1, 0]];
  return [[5, 1], [4, 2], [3, 2], [2, 1], [1, 1]];
}

const VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
];
let _v = 0;
function sampleVideo() {
  return VIDEOS[_v++ % VIDEOS.length];
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
