/**
 * draft-fields.test.ts — the rules that turn a normal group post into a
 * complete draft: explicit lines, photo captions, resource mode, and the
 * "publish without a tap" gate.
 *
 * Run with:  npx tsx apps/api/src/telegram-ingest/draft-fields.test.ts
 *
 * Pure: no database, no network.
 */
import * as assert from 'assert';
import {
  autoPublishBlockers,
  bodyFromPost,
  classifyStandalone,
  cleanPostTitle,
  courseKindFrom,
  describeAnnouncement,
  extractFields,
  hasMeaningfulProse,
  mediaName,
  mediaRole,
  parseResourcePost,
  partHeading,
  resourceTypeOf,
  stripPromo,
  titleFromPost,
} from './draft-fields';
import type { DraftPayload } from './draft-parser';

let passed = 0;
function ok(cond: boolean, name: string) {
  assert.ok(cond, name);
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('\nextractFields');

const post = `🔰 Flutter Bootcamp
Taught By: Stephen Grider
org: Udemy
category: mobile-development, design
level: Intermediate
price: 49.99
tags: flutter, dart
Download Full Course`;

const extracted = extractFields(post);
ok(extracted.values.organizationName === 'Udemy', 'org line is read');
ok(extracted.values.categorySlugs === 'mobile-development, design', 'categories are read');
ok(extracted.values.levelName === 'Intermediate', 'level is read');
ok(extracted.values.price === '49.99', 'price is read');
ok(extracted.values.tags === 'flutter, dart', 'tags are read');
ok(!extracted.cleaned.includes('org:'), 'field lines leave the prose');
ok(extracted.cleaned.includes('Taught By: Stephen Grider'), '"Taught By" is left to the announcement parser');

const multiline = extractFields(`resource: Git cheatsheet
#description
Line one.
Line two.
#type roadmap`);
ok(multiline.values.description === 'Line one.\nLine two.', 'bare description marker takes the paragraph');
ok(multiline.values.contentType === 'roadmap', 'a later marker ends the paragraph');

console.log('\nphoto roles');

ok(mediaRole('cover', []) === 'cover', 'caption "cover"');
ok(mediaRole(null, []) === 'cover', 'first uncaptioned photo is the cover');
ok(
  mediaRole(null, [{ role: 'cover', fileId: 'x', messageId: 1, caption: null }]) === 'gallery',
  'a second uncaptioned photo is a gallery frame, not a lost picture',
);
ok(mediaRole('Lecturer photo', []) === 'lecturer', 'caption "lecturer photo"');
ok(mediaRole('org: Udemy', []) === 'organization', 'caption "org: Udemy"');
ok(mediaRole('random cat', []) === null, 'unrelated caption names no role');
ok(
  mediaRole('🔰 Course\n📖 Body\n🔊 Taught By: Someone', [], { announcement: true }) === 'cover',
  'an announcement photo is the cover even when its body says "Taught By"',
);
ok(
  mediaRole(
    '🔰 Course',
    [{ role: 'cover', fileId: 'x', messageId: 1, caption: null }],
    { announcement: true },
  ) === 'gallery',
  'a second announcement photo is a gallery frame',
);
ok(mediaName('lecturer: Stephen Grider') === 'Stephen Grider', 'lecturer name from caption');
ok(mediaName('org: Udemy') === 'Udemy', 'organisation name from caption');

console.log('\ncleaning real posts');

const ultimate = `🔰 Ultimate Web Development Course 2026 - Build Modern Websites

🌟 4.5 - 1646 votes  💰 Original Price: $19.99

📖 This is the only modern, always up-to-date Web Development course you will ever need.

🔊 Taught By: Haris Ali Khan

📤  Download Full Course (https://t.me/webdev_trainings/2300)    📤  Download All Courses (https://t.me/zero_to_mastery)`;

const handsOn = `🔅 Hands-On AI: Building Your First LLM-Powered App

📝 Get started building apps powered by large language models (LLMs) in this hands-on, skills-based course for beginners.

🌐 Author: Han-chung Lee
🔰 Level: Beginner
⏰ Duration: 1h 14m

📋 Topics: AI Software Development, Large Language Models, Artificial Intelligence

🔗  Join Artificial intelligence (https://machine_learning_courses.t.me/) for more courses`;

const supplyChain = `🔅 The AI-Driven Supply Chain Manager

📝 Learn practical generative AI prompts to help you enhance the efficiency, accuracy, and sustainability of your supply chain.

🌐 Author: Daniel Stanton
🔰 Level: Beginner + Intermediate
⏰ Duration: 41m

📋 Topics: Supply Chain Management, Artificial Intelligence for Business

🔗  Join Artificial intelligence (https://machine_learning_courses.t.me/) for more courses`;

const hacking = `🔰 Complete Ethical Hacking Bootcamp

🌟 4.6 - 18169 votes  💰 Original Price: $74.99

📖 Learn Ethical Hacking + Penetration Testing! Use real techniques by black hat hackers then learn to defend against them!

🔊 Taught By: Andrei Neagoie, Aleksa Tamburkovski

📤  Download Full Course (https://t.me/LinuxMastery/529)    📤  Download All Courses (https://t.me/zero_to_mastery)`;

const cleanedUltimate = stripPromo(ultimate);
ok(!cleanedUltimate.includes('Download Full Course'), 'the download line is not part of the post');
ok(!cleanedUltimate.includes('Download All Courses'), 'the "all courses" line is not part of the post');
ok(stripPromo(handsOn).includes('📝 Get started'), 'the description survives promo cleaning');
ok(
  !stripPromo(handsOn).includes('for more courses'),
  'the join line is not part of the post',
);
ok(
  !stripPromo('📱Artificial intelligence (https://Machine_Learning_Courses.t.me/)\n📱Hands-On AI').includes('📱'),
  'the forwarded category header is noise',
);
ok(!stripPromo('Body\n━━━━━━━━━━━━━━━━━━\nMore').includes('━'), 'a divider is noise');

ok(
  titleFromPost(ultimate) === 'Ultimate Web Development Course 2026 - Build Modern Websites',
  'title from the 🔰 line',
);
ok(titleFromPost(handsOn) === 'Hands-On AI: Building Your First LLM-Powered App', 'title from the 🔅 line');
ok(titleFromPost(hacking) === 'Complete Ethical Hacking Bootcamp', 'title without the emoji');
ok(
  titleFromPost('🤖 IMPORTANT AI TERMS & TOOLS YOU SHOULD KNOW 🧠\n\nA paragraph.') ===
    'IMPORTANT AI TERMS & TOOLS YOU SHOULD KNOW',
  'a trailing decorative emoji is not part of the title',
);
ok(cleanPostTitle('📕 Deep Learning with TensorFlow') === 'Deep Learning with TensorFlow', 'book title cleaned');
ok(
  cleanPostTitle('The Ultimate Design Pattern Series 👇🏼🔥') === 'The Ultimate Design Pattern Series 🔥',
  'a trailing pointer becomes one fire',
);
ok(
  cleanPostTitle('Claude Code for Professional Developers 🔥👇🏼') === 'Claude Code for Professional Developers 🔥',
  'the pointer is dropped even when the fire comes first',
);
ok(
  cleanPostTitle('The ultimate Git Mastery course 👇🏼') === 'The ultimate Git Mastery course 🔥',
  'a pointer alone gains a fire',
);
ok(
  cleanPostTitle('🎓 Claude Code for Professional Developers') === 'Claude Code for Professional Developers',
  'a leading study emoji is still trimmed for storage',
);

console.log('\npart headings');

ok(partHeading('⚡️The Ultimate Design Patterns: Part 1')?.label === 'Part 1', 'a one-line part heading is read');
ok(partHeading('⚡️The Ultimate Design Patterns: Part 2')?.title === 'The Ultimate Design Patterns', 'the heading names the course');
ok(partHeading('Part 3 of 3')?.label === 'Part 3', '"Part 3 of 3" normalises');
ok(partHeading('The course, part two')?.label === 'Part 2', 'a spelled-out number normalises');
ok(partHeading('Part IV')?.label === 'Part 4', 'a roman numeral normalises');
ok(partHeading('01 - Getting Started (5m).zip') === null, 'a ZIP is not a part heading');
ok(partHeading('This is a long paragraph that mentions part 1 while explaining something else entirely, which is not a heading but prose that should stay prose.') === null, 'prose that mentions a part is not a heading');
ok(partHeading('https://t.me/syncourse/1 Part 1') === null, 'a link post is not a heading');

ok(
  describeAnnouncement(ultimate) ===
    'This is the only modern, always up-to-date Web Development course you will ever need.',
  '🔖 🔰 template description comes from 📖',
);
ok(
  describeAnnouncement(handsOn) ===
    'Get started building apps powered by large language models (LLMs) in this hands-on, skills-based course for beginners.',
  '🔅 template description comes from 📝',
);
ok(
  !describeAnnouncement(handsOn).includes('Topics:'),
  'topics stay out of the description',
);
ok(
  !describeAnnouncement(hacking).includes('Taught By'),
  'the teacher line stays out of the description',
);
ok(
  bodyFromPost(handsOn).includes('Topics:'),
  'the body keeps the meta lines the description drops',
);

console.log('\nresource mode');

ok(resourceTypeOf({}, 'resource: Figma shortcuts') === 'cheat-sheet', 'resource: prefix');
ok(resourceTypeOf({ resourceType: 'roadmap' }, '') === 'roadmap', 'resource-type: roadmap');
ok(resourceTypeOf({ contentType: 'note' }, '') === 'note', 'type: note');
ok(resourceTypeOf({}, 'A normal course post') === null, 'normal post is a course');

const resource = parseResourcePost('resource: Figma shortcuts\nUse alt+drag to duplicate.', {});
ok(resource?.title === 'Figma shortcuts', 'resource title from the marker line');
ok(resource?.body === 'Use alt+drag to duplicate.', 'resource body from the remaining lines');

// The watcher passes the field-stripped post, so the whole remainder is body.
const stripped = extractFields('resource: Git rescue\nFirst line of the body.\norg: Udemy\ncategory: git');
const fromStripped = parseResourcePost(stripped.cleaned, stripped.values, 'Git rescue');
ok(fromStripped?.title === 'Git rescue', 'title from the marker, not from the body');
ok(fromStripped?.body === 'First line of the body.', 'body is not truncated and excludes field lines');

console.log('\nnormal posts become resources');

const termsPost = `🤖 IMPORTANT AI TERMS & TOOLS YOU SHOULD KNOW 🧠

If you want to understand modern AI better, these are some of the most important terms and tools to know.

🧠 1. Generative AI

AI that can create new content such as text, images, audio, video and code.

📝 3. Prompt

A prompt is the instruction or input you give to an AI system. A clear and specific prompt generally helps you get more useful results.

🔎 8. RAG

RAG stands for Retrieval-Augmented Generation. It allows an AI system to retrieve relevant information from external sources and use it when generating an answer.`;

const terms = classifyStandalone({
  text: termsPost,
  hasImage: false,
  hasMediaFile: false,
  hasArchive: false,
});
ok(Boolean(terms), 'a long text post is a resource, not noise');
ok(terms?.title === 'IMPORTANT AI TERMS & TOOLS YOU SHOULD KNOW', 'resource title is the first real line');
ok(terms?.resourceType === 'note', 'a long text post is a note');
ok((terms?.body ?? '').includes('Retrieval-Augmented Generation'), 'the body keeps the whole post');

const photoPost = classifyStandalone({
  text: '📕 Deep Learning with TensorFlow',
  hasImage: true,
  hasMediaFile: false,
  hasArchive: false,
});
ok(photoPost?.title === 'Deep Learning with TensorFlow', 'a titled photo is a resource');
ok(photoPost?.resourceType === 'cheat-sheet', 'a short picture caption is a cheat-sheet');

const album = classifyStandalone({
  text: 'Machine Learning vs. Deep Learning\n\n🤖 Machine Learning: engineered features.\n🧠 Deep Learning: learns features end-to-end.',
  hasImage: true,
  hasMediaFile: false,
  hasArchive: false,
});
ok(album?.title === 'Machine Learning vs. Deep Learning', 'an album uses its caption as the title');
ok(Boolean(album?.body), 'an album caption keeps its body');

const photoOnly = classifyStandalone({
  text: null,
  hasImage: true,
  hasMediaFile: false,
  hasArchive: false,
});
ok(photoOnly?.needsTitle === true, 'a photo with no caption is kept, flagged for a human');
ok((photoOnly?.title ?? '').startsWith('Photo post ·'), 'the placeholder title says it is a photo post');

const book = classifyStandalone({
  text: null,
  hasImage: true,
  hasMediaFile: true,
  hasArchive: false,
  fileName: 'Ethan Mollick - Co-Existence.epub',
});
ok(book?.title === 'Ethan Mollick - Co-Existence', 'a file with no caption takes its filename as title');

ok(
  classifyStandalone({ text: 'hi', hasImage: false, hasMediaFile: false, hasArchive: false }) === null,
  'a greeting is not a resource',
);
ok(
  classifyStandalone({ text: 'resources', hasImage: false, hasMediaFile: false, hasArchive: false }) === null,
  'the word "resources" alone is not a resource',
);
ok(
  classifyStandalone({
    text: 'n8n Roadmap\n\n1. Learn nodes\n2. Learn expressions\n3. Learn error handling\n4. Build your first workflow',
    hasImage: false,
    hasMediaFile: false,
    hasArchive: false,
  })?.resourceType === 'roadmap',
  'a post that says roadmap is a roadmap',
);
ok(
  classifyStandalone({ text: 'Short clip', hasImage: false, hasMediaFile: true, hasArchive: false, fileName: 'clip.mp4' })
    ?.title === 'Short clip',
  'a captioned video is a resource',
);
ok(
  classifyStandalone({ text: null, hasImage: false, hasMediaFile: true, hasArchive: false, fileName: 'talk.mp3' })
    ?.title === 'talk',
  'an uncaptioned audio file becomes its own post',
);

console.log('\nmini-course rules');

ok(
  courseKindFrom({ text: handsOn, title: 'Hands-On AI', durationMin: 74, lessonCount: null }) === 'mini-course',
  '1h 14m reads as a mini-course',
);
ok(
  courseKindFrom({ text: supplyChain, title: 'Supply Chain', durationMin: 41, lessonCount: null }) === 'mini-course',
  '41m reads as a mini-course',
);
ok(
  courseKindFrom({ text: '', title: 'Ethical Hacking', durationMin: null, lessonCount: null, fileCount: 20 }) === 'course',
  'twenty module ZIPs are a full course',
);
ok(
  courseKindFrom({ text: '', title: 'Hands-On AI', durationMin: null, lessonCount: null, fileCount: 3 }) === 'mini-course',
  'three ZIPs are a mini-course',
);
ok(
  courseKindFrom({ text: '', title: 'Ultimate Web Development Course 2026', durationMin: null, lessonCount: null, fileCount: 3 }) ===
    'course',
  'a post that calls itself a course is not reduced by a small ZIP count',
);
ok(
  courseKindFrom({ text: '', title: 'Complete Course', durationMin: 600, lessonCount: null, fileCount: 2 }) === 'course',
  'a long duration wins over a small file count',
);
ok(
  courseKindFrom({ text: '', title: 'Course', durationMin: null, lessonCount: 40, fileCount: 2 }) === 'course',
  'a long lesson count wins over a small file count',
);
ok(
  courseKindFrom({ text: '', title: 'Course', durationMin: 41, lessonCount: null, declared: 'course' }) === 'course',
  'an explicit type line always wins',
);



console.log('\nauto-publish gate');

function payload(overrides: Partial<DraftPayload> = {}): DraftPayload {
  return {
    version: 1,
    kind: 'course',
    announcement: {
      title: 'Complete Flutter',
      slug: 'complete-flutter',
      description:
        'A long, complete description of the course that explains what a learner will build and why it matters.',
      lecturerNames: ['Stephen Grider'],
      durationMin: 600,
      lessonCount: 40,
      ratingAvg: null,
      ratingCount: null,
      originalPrice: 49,
      hashtags: ['flutter'],
      sourceUrl: null,
      postedAt: new Date().toISOString(),
    },
    chat: { id: -1, username: 'group', title: 'Group' },
    topic: { id: null, name: null },
    author: { id: 1, username: 'admin', firstName: 'Admin' },
    files: [
      {
        messageId: 2,
        fileId: 'f',
        fileName: 'part1.zip',
        fileSizeMb: 100,
        mimeType: 'application/zip',
        moduleTitle: null,
        partIndex: 1,
        addedAt: new Date().toISOString(),
      },
    ],
    categorySlugs: ['mobile-development'],
    confidence: 0.9,
    signals: ['taught-by', 'price', 'hours'],
    cardMessageId: null,
    ...overrides,
  };
}

ok(autoPublishBlockers(payload()).length === 0, 'complete course publishes itself');
ok(
  autoPublishBlockers(payload({ files: [] })).includes('files'),
  'no files waits for review',
);
ok(
  autoPublishBlockers(
    payload({
      announcement: { ...payload().announcement, description: 'short' },
    }),
  ).includes('description'),
  'short description waits for review',
);
ok(
  autoPublishBlockers(
    payload({
      announcement: { ...payload().announcement, lecturerNames: [] },
    }),
  ).includes('lecturer'),
  'missing lecturer waits for review',
);
ok(
  autoPublishBlockers(payload({ signals: ['course-exists'] })).includes('already-exists'),
  'an existing course always asks',
);
ok(
  autoPublishBlockers(payload({ confidence: 0.4 })).includes('low-confidence'),
  'low confidence waits for review',
);
ok(
  autoPublishBlockers(
    payload({
      kind: 'resource',
      files: [],
      announcement: { ...payload().announcement, description: 'x'.repeat(80) },
    }),
  ).length === 0,
  'a resource with a body publishes itself',
);
ok(
  autoPublishBlockers(
    payload({
      kind: 'resource',
      files: [],
      images: [{ role: 'cover', fileId: 'p', messageId: 3, caption: null }],
      announcement: { ...payload().announcement, description: '' },
    }),
  ).length === 0,
  'a picture-only resource publishes itself',
);
ok(
  autoPublishBlockers(
    payload({
      kind: 'resource',
      files: [],
      images: [],
      announcement: { ...payload().announcement, description: '' },
    }),
  ).includes('body'),
  'an empty resource waits for a body or a picture',
);
ok(
  autoPublishBlockers(
    payload({
      kind: 'resource',
      signals: ['standalone', 'needs-title'],
      announcement: { ...payload().announcement, title: 'Photo post · 2026-11-19' },
    }),
  ).includes('title'),
  'a placeholder title always waits for a human',
);
ok(
  autoPublishBlockers(
    payload({
      signals: ['simple-course'],
      announcement: {
        ...payload().announcement,
        lecturerNames: [],
        description: '',
      },
    }),
  ).length === 0,
  'a titled picture plus ZIPs publishes as a simple course',
);
ok(
  autoPublishBlockers(payload({ announcement: { ...payload().announcement, title: '' }, fields: { title: '' } })).includes(
    'title',
  ),
  'a course with no title waits',
);

console.log('\nresource vs course');

ok(!hasMeaningfulProse('#claude_code_devs'), 'a hashtag-only caption is not prose');
ok(!hasMeaningfulProse('🔥👇🏼 https://t.me/example'), 'emoji and links are not prose');
ok(
  hasMeaningfulProse('This byte-sized course teaches you how to build LLM applications with LangChain and Python.'),
  'a real description is prose',
);

console.log(`\n${passed} checks passed\n`);
