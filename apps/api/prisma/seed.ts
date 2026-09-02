/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// sample videos that actually play in the web player
const SAMPLE_VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
];

const img = (seed: number) => `https://picsum.photos/seed/syncourse${seed}/600/900`;

async function main() {
  // Safety guard: never wipe a production database by accident.
  // Run the full (wiping) seed with NODE_ENV !== 'production', or explicitly
  // opt in with FORCE_SEED=1. Use prisma/seed-tail.ts for safe additive
  // seeding against an already-populated database.
  if (process.env.NODE_ENV === 'production' && process.env.FORCE_SEED !== '1') {
    console.error('Refusing to run the wiping seed against NODE_ENV=production.');
    console.error('Use FORCE_SEED=1 to override, or run prisma/seed-tail.ts instead.');
    process.exit(1);
  }

  console.log('Seeding Syncourse demo data…');

  // wipe (dev convenience)
  await prisma.$transaction([
    prisma.rating.deleteMany(),
    prisma.reviewUpvote.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.review.deleteMany(),
    prisma.downloadEvent.deleteMany(),
    prisma.savedCourse.deleteMany(),
    prisma.likedCourse.deleteMany(),
    prisma.collectionItem.deleteMany(),
    prisma.savedList.deleteMany(),
    prisma.collectionList.deleteMany(),
    prisma.lessonFile.deleteMany(),
    prisma.note.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.lesson.deleteMany(),
    prisma.section.deleteMany(),
    prisma.courseTag.deleteMany(),
    prisma.courseAudience.deleteMany(),
    prisma.courseCategory.deleteMany(),
    prisma.learningPathCourse.deleteMany(),
    prisma.learningPath.deleteMany(),
    prisma.course.deleteMany(),
    prisma.category.deleteMany(),
    prisma.lecturer.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.level.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.paymentReference.deleteMany(),
    prisma.trendingQuery.deleteMany(),
    prisma.follow.deleteMany(),
    prisma.tasteProfile.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.appVersion.deleteMany(),
    prisma.legalDocument.deleteMany(),
  ]);

  // levels
  const levels: Record<string, string> = {};
  for (const name of ['Beginner', 'Intermediate', 'Advanced', 'All Levels']) {
    const l = await prisma.level.create({ data: { name } });
    levels[name] = l.id;
  }

  // categories
  const catDefs = [
    { name: 'AI & Machine Learning', icon: '🤖', sort: 1 },
    { name: 'Web Development', icon: '🌐', sort: 2 },
    { name: 'Data Science', icon: '📊', sort: 3 },
    { name: 'Mobile Development', icon: '📱', sort: 4 },
    { name: 'DevOps & Cloud', icon: '☁️', sort: 5 },
    { name: 'Design', icon: '🎨', sort: 6 },
    { name: 'Business', icon: '💼', sort: 7 },
    { name: 'Programming', icon: '💻', sort: 8 },
  ];
  const cats: Record<string, string> = {};
  for (const c of catDefs) {
    const cat = await prisma.category.create({
      data: { name: c.name, slug: slugify(c.name), icon: c.icon, sortOrder: c.sort, coverImage: img(c.sort) },
    });
    cats[c.name] = cat.id;
  }

  // lecturers
  const lecturers: Record<string, string> = {};
  const lecturerDefs = [
    { name: 'Derek Cheung', creds: 'AI Automation & n8n expert', bio: 'Derek builds no-code AI automation workflows with n8n and LangChain. He has taught 50,000+ students how to automate their work with visual tooling.' },
    { name: 'Andrei Neagoie', creds: 'Founder, Zero To Mastery', bio: 'Andrei has taught over 900,000 students on Udemy and YouTube. He focuses on practical, project-driven courses in web development and AI.' },
    { name: 'Daniel Bourke', creds: 'Machine Learning Engineer', bio: 'Daniel teaches machine learning with a learn-by-doing approach, mixing theory with hands-on PyTorch and TensorFlow projects.' },
    { name: 'Max Schwarzmüller', creds: 'Academind founder', bio: 'Max has taught 2M+ students across web development and React courses, known for deep-dive explanations and real-world examples.' },
    { name: 'Adrian Twarog', creds: 'Full-stack developer', bio: 'Adrian creates beginner-friendly tutorials on web development, design and freelancing.' },
  ];
  for (const l of lecturerDefs) {
    const lec = await prisma.lecturer.create({
      data: {
        name: l.name,
        slug: slugify(l.name),
        photoUrl: null, // clients render initial-letter avatars until a real photo is uploaded
        bio: l.bio,
        credentials: l.creds,
        socialLinks: JSON.stringify({ twitter: `https://twitter.com/${slugify(l.name).replace(/-/g, '')}` }),
      },
    });
    lecturers[l.name] = lec.id;
  }

  // organizations (publisher channels)
  const orgDefs = [
    { name: 'DevPack', subscribers: 12000, orgType: 'publisher', description: 'A packed collection of developer resources, courses and cheat-sheets shared across 36 Telegram chats.' },
    { name: 'Zero To Mastery', subscribers: 144553, orgType: 'company', description: 'Download and watch programming courses — the reference channel behind this audit.' },
    { name: 'Academind', subscribers: 210000, orgType: 'company', description: 'Learn web development and more with Max Schwarzmüller and team.' },
  ];
  const orgs: Record<string, string> = {};
  for (const o of orgDefs) {
    const org = await prisma.organization.create({
      data: { name: o.name, slug: slugify(o.name), subscribers: o.subscribers, description: o.description, orgType: o.orgType, logoUrl: null }, // initials avatar until a real logo is uploaded
    });
    orgs[o.name] = org.id;
  }

  // courses
  const courseDefs = [
    {
      title: 'AI — Introduction to AI Automation with n8n & LangChain (no-code)',
      desc: 'Learn to visually automate tasks, integrate apps, and streamline processes with n8n and LangChain — no code required. Build real AI workflows from day one.',
      cat: 'AI & Machine Learning',
      lecturer: 'Derek Cheung',
      org: 'DevPack',
      level: 'Beginner',
      rating: 4.5, votes: 730, downloads: 12400,
      originalPrice: 44.99, isPremium: false, featured: true,
      contentType: 'course',
      tags: ['n8n', 'LangChain', 'AI Automation', 'No-Code', 'ChatGPT', 'Workflow'],
      audience: ['career-switchers', 'automation seekers', 'beginners'],
      prereq: 'No experience needed. A computer and curiosity are enough.',
    },
    {
      title: 'The Complete Web Developer Bootcamp',
      desc: 'Become a full-stack web developer with HTML, CSS, JavaScript, React, Node.js and databases. Project-driven from zero to job-ready.',
      cat: 'Web Development',
      lecturer: 'Andrei Neagoie',
      org: 'Zero To Mastery',
      level: 'All Levels',
      rating: 4.8, votes: 152000, downloads: 890000,
      originalPrice: 94.99, isPremium: true, featured: true,
      contentType: 'course',
      tags: ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Full-Stack'],
      audience: ['beginners', 'career-switchers', 'students'],
      prereq: 'No programming experience required.',
    },
    {
      title: 'Machine Learning for Beginners: PyTorch Edition',
      desc: 'Learn machine learning fundamentals and build your first models with PyTorch. Covers regression, classification, CNNs and more.',
      cat: 'Data Science',
      lecturer: 'Daniel Bourke',
      org: 'Zero To Mastery',
      level: 'Beginner',
      rating: 4.7, votes: 31000, downloads: 120000,
      originalPrice: 64.99, isPremium: false, featured: false,
      contentType: 'course',
      tags: ['PyTorch', 'Machine Learning', 'Python', 'Neural Networks'],
      audience: ['students', 'data enthusiasts', 'beginners'],
      prereq: 'Basic Python knowledge recommended.',
    },
    {
      title: 'React — The Complete Guide (incl. Hooks & Next.js)',
      desc: 'Dive in and learn React from scratch! Learn React, Hooks, Redux, React Router, Next.js, and build real apps.',
      cat: 'Web Development',
      lecturer: 'Max Schwarzmüller',
      org: 'Academind',
      level: 'Intermediate',
      rating: 4.6, votes: 98000, downloads: 760000,
      originalPrice: 84.99, isPremium: true, featured: true,
      contentType: 'course',
      tags: ['React', 'Hooks', 'Redux', 'Next.js', 'JavaScript'],
      audience: ['web developers', 'frontend engineers', 'students'],
      prereq: 'HTML, CSS and basic JavaScript.',
    },
    {
      title: 'AI/ML Engineer Roadmap — 15 Step Cheat-Sheet',
      desc: 'A visual roadmap to becoming an AI/ML engineer: Python Basics → Data Processing → NLP Fundamentals → Model Evaluation & Tuning.',
      cat: 'AI & Machine Learning',
      lecturer: 'Derek Cheung',
      org: 'DevPack',
      level: 'All Levels',
      rating: 4.4, votes: 1900, downloads: 8400,
      originalPrice: 19.99, isPremium: false, featured: false,
      contentType: 'roadmap',
      tags: ['Roadmap', 'AI', 'ML', 'Career'],
      audience: ['career-switchers', 'students'],
      prereq: 'None.',
    },
    {
      title: 'Top AI Algorithms & Their Use-Cases (Cheat-Sheet)',
      desc: 'A structured reference of the algorithms that power modern AI — supervised, unsupervised, deep learning and optimization techniques with one-line explanations.',
      cat: 'AI & Machine Learning',
      lecturer: 'Derek Cheung',
      org: 'DevPack',
      level: 'All Levels',
      rating: 4.6, votes: 2750, downloads: 15000,
      originalPrice: 9.99, isPremium: false, featured: false,
      contentType: 'cheat-sheet',
      tags: ['Algorithms', 'Cheat-Sheet', 'AI', 'Reference'],
      audience: ['students', 'practitioners'],
      prereq: 'None.',
    },
    {
      title: 'Docker & Kubernetes: The Practical Guide',
      desc: 'Learn Docker and Kubernetes from scratch with hands-on projects — containers, images, volumes, networking, and orchestrating apps in production.',
      cat: 'DevOps & Cloud',
      lecturer: 'Max Schwarzmüller',
      org: 'Academind',
      level: 'Intermediate',
      rating: 4.7, votes: 42000, downloads: 210000,
      originalPrice: 74.99, isPremium: true, featured: false,
      contentType: 'course',
      tags: ['Docker', 'Kubernetes', 'DevOps', 'Cloud'],
      audience: ['developers', 'devops engineers'],
      prereq: 'Basic terminal and programming knowledge.',
    },
    {
      title: 'Flutter & Dart — The Complete Guide',
      desc: 'Learn Flutter and Dart to build beautiful native mobile apps for iOS and Android from one codebase.',
      cat: 'Mobile Development',
      lecturer: 'Max Schwarzmüller',
      org: 'Academind',
      level: 'Beginner',
      rating: 4.6, votes: 38000, downloads: 190000,
      originalPrice: 89.99, isPremium: false, featured: false,
      contentType: 'course',
      tags: ['Flutter', 'Dart', 'Mobile', 'iOS', 'Android'],
      audience: ['mobile developers', 'beginners'],
      prereq: 'No mobile experience needed.',
    },
  ];

  const courseIds: string[] = [];
  for (let i = 0; i < courseDefs.length; i++) {
    const d = courseDefs[i];
    const course = await prisma.course.create({
      data: {
        title: d.title,
        slug: slugify(d.title),
        description: d.desc,
        // no placeholder images — clients render branded gradient covers
        // until a real cover is uploaded through the admin CMS
        thumbnailUrl: null,
        bannerUrl: null,
        previewVideoUrl: SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length],
        language: 'English',
        levelId: levels[d.level],
        lecturerId: lecturers[d.lecturer],
        organizationId: orgs[d.org],
        originalPrice: d.originalPrice,
        price: d.originalPrice,
        isPremium: d.isPremium,
        isFeatured: d.featured,
        contentType: d.contentType,
        prerequisites: d.prereq,
        ratingAvg: d.rating,
        ratingCount: d.votes,
        downloadCount: d.downloads,
        publishedAt: new Date(Date.now() - i * 5 * 24 * 60 * 60 * 1000),
      },
    });
    courseIds.push(course.id);
    await prisma.courseCategory.create({ data: { courseId: course.id, categoryId: cats[d.cat] } });
    await prisma.courseCategory.create({ data: { courseId: course.id, categoryId: cats['Programming'] } });
    for (const t of d.tags) await prisma.courseTag.create({ data: { courseId: course.id, tag: t } });
    for (const a of d.audience) await prisma.courseAudience.create({ data: { courseId: course.id, audienceTag: a } });

    // sections + lessons
    const sectionCount = d.contentType === 'course' ? 4 : 2;
    const lessonsPerSection = d.contentType === 'course' ? 5 : 3;
    for (let s = 0; s < sectionCount; s++) {
      const section = await prisma.section.create({
        data: { courseId: course.id, title: `Section ${s + 1}${sectionTitles(d.cat)[s] ? ` — ${sectionTitles(d.cat)[s]}` : ''}`, orderIndex: s },
      });
      for (let l = 0; l < lessonsPerSection; l++) {
        const lesson = await prisma.lesson.create({
          data: {
            courseId: course.id,
            sectionId: section.id,
            title: lessonTitles(d.cat)[(s * lessonsPerSection + l) % lessonTitles(d.cat).length],
            orderIndex: l,
            type: 'video',
            durationSec: (8 + ((s * lessonsPerSection + l) % 6) * 7) * 60,
            videoUrl: SAMPLE_VIDEOS[(s + l) % SAMPLE_VIDEOS.length],
            isPreview: s === 0 && l === 0,
          },
        });
        // lesson files — quality variants (mirrors the download sheet)
        const variants = [
          { label: '1080p', sizeMb: 892.8, codec: 'x265', best: true },
          { label: '720p', sizeMb: 484.1, codec: 'x264', best: false },
          { label: '480p', sizeMb: 214.3, codec: 'x264', best: false },
        ];
        for (const v of variants) {
          await prisma.lessonFile.create({
            data: {
              lessonId: lesson.id,
              label: v.label,
              format: 'mp4',
              sizeMb: v.sizeMb,
              durationSec: lesson.durationSec,
              codec: v.codec,
              hasSubtitles: true,
              audio: 'EN',
              isBest: v.best,
            },
          });
        }
        // notes with images — the "Section → Term: explanation" format
        if (l === 0) {
          await prisma.note.create({
            data: {
              lessonId: lesson.id,
              courseId: course.id,
              title: 'Key concepts — cheat-sheet',
              richText: notesMarkdown(d.cat),
              imageUrls: JSON.stringify([img(700 + i), img(750 + i)]),
              pdfUrl: null,
              isCheatsheet: true,
            },
          });
        }
      }
    }
  }

  // learning paths
  const paths = [
    { title: 'Full-Stack Web Path', desc: 'Become a job-ready full-stack developer: frontend → backend → deployment.', order: 1 },
    { title: 'AI & ML Starter Path', desc: 'From zero to building your own ML models: automation, fundamentals, PyTorch.', order: 2 },
  ];
  for (let p = 0; p < paths.length; p++) {
    const path = await prisma.learningPath.create({
      data: { title: paths[p].title, description: paths[p].desc, coverUrl: null, sortOrder: p }, // clients render the path card art
    });
    for (let c = 0; c < Math.min(courseIds.length, 4); c++) {
      await prisma.learningPathCourse.create({
        data: { pathId: path.id, courseId: courseIds[(p + c) % courseIds.length], order: c },
      });
    }
  }

  // demo users
  const demoPassword = await bcrypt.hash('demo1234', 10);
  const demo = await prisma.user.create({
    data: {
      name: 'Hayredin Demo',
      username: 'hayredin',
      email: 'demo@syncourse.app',
      passwordHash: demoPassword,
      isVerified: true,
      isStaff: true,
      gender: 'Male',
      planType: 'premium',
      planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      telegramUsername: 'hayredin6180',
    },
  });
  const second = await prisma.user.create({
    data: { name: 'Selam Test', username: 'selam_test', email: 'selam@syncourse.app', passwordHash: demoPassword, isVerified: true },
  });

  // library + ratings + reviews + downloads
  await prisma.savedCourse.create({ data: { userId: demo.id, courseId: courseIds[2] } });
  await prisma.likedCourse.create({ data: { userId: demo.id, courseId: courseIds[1] } });

  const list = await prisma.collectionList.create({
    data: { userId: demo.id, name: 'AI Starter Pack', description: 'Courses I want to finish this quarter', visibility: 'public' },
  });
  await prisma.collectionItem.create({ data: { listId: list.id, courseId: courseIds[0] } });
  await prisma.collectionItem.create({ data: { listId: list.id, courseId: courseIds[2] } });

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
  // thread upvotes + a second thread for the discussion module
  await prisma.reviewUpvote.create({ data: { userId: second.id, reviewId: review.id } });
  await prisma.review.update({ where: { id: review.id }, data: { upvotes: { increment: 1 } } });
  await prisma.review.create({
    data: {
      userId: second.id,
      courseId: courseIds[0],
      body: 'Does this course cover OpenAI integrations too, or only open-source models?',
      containsSpoilers: false,
    },
  });

  // in-app notifications (demo inbox for the notifications screen)
  await prisma.notification.createMany({
    data: [
      { userId: demo.id, type: 'new_lesson', title: 'New lesson available', body: '“Deploying your automation” was just added to the AI automation course.', deepLink: `/courses/${slugify(courseDefs[0].title)}` },
      { userId: demo.id, type: 'progress', title: '60% there!', body: "You're 60% through the AI automation course. Keep going!", deepLink: `/courses/${slugify(courseDefs[0].title)}` },
      { userId: demo.id, type: 'system', title: 'Welcome to SynCourse', body: 'Thanks for joining — your learning journey starts here.', deepLink: '/' },
    ],
  });

  // download events spread over 30 days for the analytics widget
  const day = 24 * 60 * 60 * 1000;
  for (let i = 0; i < 40; i++) {
    await prisma.downloadEvent.create({
      data: {
        userId: i % 3 === 0 ? demo.id : null,
        lessonId: (await firstLessons(courseIds[0]))[i % 5],
        courseId: courseIds[0],
        quality: ['1080p', '720p', '480p'][i % 3],
        method: i % 4 === 0 ? 'bot' : 'app',
        createdAt: new Date(Date.now() - i * 18 * 60 * 60 * 1000),
      },
    });
  }
  await prisma.course.update({ where: { id: courseIds[0] }, data: { downloadCount: { increment: 40 } } });

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

  await prisma.appVersion.createMany({
    data: [
      { version: '0.1.1', releasedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), changelogMd: '- Discussion threads with upvotes\n- In-app notifications + Telegram reminders\n- Browse filter sheet (category / level / rating)\n- Lecturer & organization profile pages\n- Settings: link Telegram, manage sessions' },
      { version: '0.1.0', releasedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), changelogMd: '- Initial release\n- Home rails, browse, search, course detail, notes\n- My Learning, lists, reviews\n- Premium plans (ETB + USD)' },
    ],
  });
  await prisma.legalDocument.createMany({
    data: [
      { type: 'terms', version: '1.0', bodyMd: '# Terms of Service\n\nLast updated: 2026.\n\nSyncourse is a course discovery and learning service. By creating an account or buying a subscription you agree to these terms.\n\n1. **Your account** — one person per account, keep your access secure.\n2. **Premium** — sold as a fixed-length pass (1, 3 or 6 months). It does not renew automatically.\n3. **Refunds** — every purchase carries a 14-day money-back guarantee.\n4. **Acceptable use** — no scraping, no sharing accounts, no unlawful use.\n5. **Liability** — limited to the amount you paid in the twelve months before a claim.\n\nQuestions: message the support account on Telegram.' },
      { type: 'privacy', version: '1.0', bodyMd: '# Privacy Policy\n\nLast updated: 2026.\n\nWhat we collect: account details, payment records (order/amount/reference only — never card numbers or wallet keys), usage (courses watched, downloaded, searched, rated) and technical data (IP, device, timestamps).\n\nWe do not sell your personal information. Processors may include: payment verification providers, transactional email, hosting/CDN, and Telegram if you link an account.\n\nYour choices: you may request a copy, correction, or deletion of your data at any time.' },
      { type: 'refund', version: '1.0', bodyMd: '# Refund Policy\n\nEvery purchase is covered by a 14-day, no-questions-asked money-back guarantee. Message support with your email and payment reference (Telebirr transaction number or crypto invoice ID).\n\nAfter 14 days we still refund in full when the fault is ours: double charges, overcharges, or accounts closed without a Terms breach.\n\nCrypto refunds are sent as a new transaction; the network fee is deducted and the amount is valued in USD at refund time.' },
    ],
  });

  console.log('Seed complete ✅');
  console.log('  Demo login: demo@syncourse.app / demo1234');
  console.log(`  ${courseIds.length} courses, ${catDefs.length} categories, ${lecturerDefs.length} lecturers`);
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function firstLessons(courseId: string) {
  const lessons = await prisma.lesson.findMany({ where: { courseId }, orderBy: { orderIndex: 'asc' }, take: 5 });
  return lessons.map((l) => l.id);
}

function sectionTitles(cat: string) {
  const map: Record<string, string[]> = {
    'AI & Machine Learning': ['Getting Started', 'Core Concepts', 'Hands-On Practice', 'Project'],
    'Web Development': ['HTML & CSS', 'JavaScript', 'Frontend Frameworks', 'Backend & Deployment'],
    'Data Science': ['Python Fundamentals', 'Data Wrangling', 'Model Building', 'Evaluation'],
    'Mobile Development': ['Dart Basics', 'Flutter Widgets', 'State & Navigation', 'Shipping'],
    'DevOps & Cloud': ['Containers', 'Images & Volumes', 'Orchestration', 'Production'],
    'Design': ['Principles', 'Tools', 'Practice', 'Portfolio'],
    'Business': ['Strategy', 'Marketing', 'Sales', 'Scaling'],
    'Programming': ['Basics', 'Control Flow', 'Data Structures', 'Advanced'],
  };
  return map[cat] ?? map['Programming'];
}

function lessonTitles(cat: string) {
  const map: Record<string, string[]> = {
    'AI & Machine Learning': ['What is AI automation?', 'Setting up n8n', 'Connecting your first API', 'Building a LangChain workflow', 'Prompts that work', 'Automating daily tasks', 'Handling errors', 'Deploying your automation', 'From prototype to production'],
    'Web Development': ['How the web works', 'Your first HTML page', 'Styling with CSS', 'JavaScript basics', 'DOM manipulation', 'Building with React', 'State and props', 'APIs and fetch', 'Deploying to the cloud'],
    'Data Science': ['Why Python?', 'Jupyter notebooks', 'Pandas essentials', 'Data cleaning', 'Exploratory analysis', 'Your first model', 'Training vs evaluation', 'Tuning hyperparameters', 'Shipping a model'],
    'Mobile Development': ['Dart tour', 'First Flutter app', 'Widgets 101', 'Layouts and themes', 'Navigation', 'State management', 'Networking', 'Local storage', 'Publishing'],
    'DevOps & Cloud': ['What are containers?', 'Installing Docker', 'Your first image', 'Dockerfiles', 'Volumes and networks', 'Compose', 'Kubernetes basics', 'Deploying pods', 'Scaling in production'],
    'Design': ['Design principles', 'Color theory', 'Typography', 'Layout grids', 'Wireframing', 'Prototyping', 'User testing', 'Design systems', 'Portfolio tips'],
    'Business': ['Finding your market', 'Value proposition', 'Pricing', 'Acquiring customers', 'Retention', 'Operations', 'Team building', 'Funding', 'Scaling up'],
    'Programming': ['What is programming?', 'Variables and types', 'Conditions and loops', 'Functions', 'Data structures', 'Debugging', 'OOP basics', 'Working with files', 'Final project'],
  };
  return map[cat] ?? map['Programming'];
}

function notesMarkdown(cat: string) {
  if (cat === 'AI & Machine Learning') {
    return `### Top AI Algorithms & Their Use-Cases

A structured reference of the algorithms that power modern AI.

**Supervised Learning**
- Linear Regression: predicts continuous values from features
- Logistic Regression: binary classification with probabilities
- Decision Trees: interpretable rule-based classification/regression
- Random Forest: ensemble of trees, robust to overfitting
- K-Nearest Neighbors: classifies by majority vote of neighbors
- Support Vector Machines: finds max-margin decision boundary

**Unsupervised Learning**
- K-Means: partitions data into k clusters by distance
- PCA: reduces dimensionality while preserving variance
- Gaussian Mixture Models: soft clustering with probabilities

**Deep Learning & Neural Networks**
- LSTM: sequence modeling (text, time series) with long-term memory
- CNNs: image feature extraction with convolutional filters
- Transformers: attention-based models behind GPT and BERT

**Optimization & Other Techniques**
- Gradient Descent: iteratively minimizes the loss function
- Regularization (L1/L2): prevents overfitting
- Ensemble Methods: combine weak models into strong predictions`;
  }
  return `### Key Concepts — Cheat-Sheet

**Core Terms**
- ${cat}: what this module is about at a glance
- Hands-on practice: the fastest way to internalize each concept
- Real projects: apply what you learn to something you care about

**Tips**
- Follow along with the code, don't just watch
- Pause and experiment before moving on
- Take notes in your own words — this is what sticks`;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
