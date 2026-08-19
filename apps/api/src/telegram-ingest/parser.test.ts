/**
 * parser.test.ts — standalone assertions for telegram-feed.parser.ts.
 * Run with:  npx ts-node src/telegram-ingest/parser.test.ts
 * (No DB, no network — pure parsing.)
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildFeed,
  looksLikeCoursePost,
  organizeParts,
  parseFlexDate,
  parsePastedText,
  parseTelegramHtml,
  partFromFile,
  slugify,
} from './telegram-feed.parser';

let passed = 0;
function ok(cond: boolean, name: string) {
  assert.ok(cond, name);
  passed++;
  console.log(`  ✓ ${name}`);
}

// --- slugify ---------------------------------------------------------
ok(slugify('AI & Machine Learning') === 'ai-and-machine-learning', 'slugify collapses & and spaces');
ok(slugify('The Complete Web Developer in - Zero to Mastery') === 'the-complete-web-developer-in-zero-to-mastery', 'slugify strips dashes');

// --- dates ------------------------------------------------------------
ok(parseFlexDate('4/22/21 5:40 PM')?.getFullYear() === 2021, 'parseFlexDate handles M/D/YY PM');
ok(parseFlexDate('4/22/21 5:40 PM')?.getHours() === 17, 'parseFlexDate PM hour');

// --- part file names --------------------------------------------------
let p = partFromFile('8. Matplotlib Plotting and Data Visualization - Part 01.zip', 1, 'x/1', null);
ok(p.moduleTitle === '8. Matplotlib Plotting and Data Visualization', `partFromFile module: ${p.moduleTitle}`);
ok(p.partNo === 1, 'partFromFile partNo');

p = partFromFile('14_Neural_Networks_Deep_Learning,_Transfer_Learning_and_TensorFlow.zip', 2, 'x/2', null);
ok(p.moduleTitle === '14. Neural Networks Deep Learning, Transfer Learning and TensorFlow', `underscore module: ${p.moduleTitle}`);

p = partFromFile('02 Deep Learning and TensorFlow Fundamentals - Part 03.zip', 3, 'x/3', null);
ok(p.moduleTitle === '02. Deep Learning and TensorFlow Fundamentals', `numbered module: ${p.moduleTitle}`);
ok(p.partNo === 3, 'partNo 3');

p = partFromFile('Where To Go From Here.zip', 4, 'x/4', null);
ok(p.moduleTitle === 'Where To Go From Here', `no-index module: ${p.moduleTitle}`);

// --- announcement parsing ----------------------------------------------
const annText = [
  '🔰 The Complete Web Developer in - Zero to Mastery',
  '',
  '⏱️ 37 Hours  📦 368 Lessons',
  '',
  'Learn to code and become a web developer in 2021 learning HTML, CSS, JavaScript, React, Node.js, Machine Learning & more.',
  '',
  'Taught by: Andrei Neagoie',
  '',
  'Download Full Course: https://t.me/webdev_trainings/6',
  'Download All Courses: https://t.me/zero_to_mastery',
  '',
  '#web #development',
].join('\n');
const course = looksLikeCoursePost({ postId: null, date: null, text: annText, links: ['https://t.me/webdev_trainings/6'], fileName: null, fileList: [], isPoll: false, isPhoto: false });
ok(course !== null, 'announcement detected');
ok(course!.title === 'The Complete Web Developer in - Zero to Mastery', `title: ${course!.title}`);
ok(course!.durationMin === 37 * 60, 'duration 37h → minutes');
ok(course!.lessonCount === 368, 'lesson count');
ok(course!.taughtBy[0] === 'Andrei Neagoie', `taughtBy: ${course!.taughtBy}`);
ok(course!.hashtags.includes('web') && course!.hashtags.includes('development'), 'hashtags parsed');
ok(course!.sourceUrl === 'https://t.me/webdev_trainings/6', 'sourceUrl = download link');

// --- pasted text transcript ---------------------------------------------
const pasted = `[4/28/21 5:09 AM] AI and Machine Learning: [ Photo ]
🔰 Complete Machine Learning and Data Science 2021
⏱️43 Hours  📦 371 Lessons
Learn Data Science, Data Analysis, Machine Learning and Python with Tensorflow.
Taught By: Andrei Neagoie
Download Full Course: https://t.me/machine_learning_courses/3
[4/28/21 5:17 AM] AI and Machine Learning: [ 1. Introduction.zip ]
[4/28/21 5:18 AM] AI and Machine Learning: [ 2. Machine Learning 101.zip ]
[4/29/21 8:09 PM] AI and Machine Learning: [ 8. Matplotlib Plotting and Data Visualization - Part 01.zip ]
[4/29/21 8:10 PM] AI and Machine Learning: [ 8. Matplotlib Plotting and Data Visualization - Part 02.zip ]
[5/10/21 5:23 AM] AI and Machine Learning: [ 14_Neural_Networks_Deep_Learning,_Transfer_Learning_and_TensorFlow.zip ]
[5/12/21 4:09 PM] AI and Machine Learning: [ Where To Go From Here.zip ]`;

const msgs = parsePastedText(pasted);
ok(msgs.length === 7, `pasted split into ${msgs.length} messages`);
const feed = buildFeed(msgs, { channelUsername: 'machine_learning_courses', channelTitle: 'AI and Machine Learning' });
ok(feed.courses.length === 1, `one course parsed (${feed.courses.length})`);
const c = feed.courses[0];
ok(c.title === 'Complete Machine Learning and Data Science 2021', `course title: ${c.title}`);
ok(c.parts.length === 6, `6 parts grouped (${c.parts.length})`);
ok(c.sections.length === 5, `4 modules grouped (${c.sections.map((s) => s.title).join(' | ')})`);
const matplot = c.sections.find((s) => s.title.startsWith('8.'));
ok(matplot !== undefined && matplot.parts.length === 2, 'Matplotlib module has 2 parts');
const nn = c.sections.find((s) => s.title.startsWith('14.'));
ok(nn !== undefined && nn.parts.length === 1, 'Neural Networks module has 1 part');

// --- "[ N files ]" list posts (Modern Computer Vision style) -----------------
const fileListPasted = `[1/25/24 4:10 AM] AI and Machine Learning: [ Photo ]
🔰 Modern Computer Vision™ PyTorch
Taught By: Rajeev D. Ratan
[1/25/24 4:10 AM] AI and Machine Learning: [ 9 files ]

01. Introduction

02. Download Code and Setup Colab

03. OpenCV - Image Operations - Part 01

03. OpenCV - Image Operations - Part 02

04. OpenCV - Image Segmentation
[1/25/24 4:10 AM] AI and Machine Learning: [ 10 files ]

05. OpenCV - Haar Cascade Classifiers

06. OpenCV - Image Analysis and Transformation
`;
const flMsgs = parsePastedText(fileListPasted);
const flFeed = buildFeed(flMsgs, { channelUsername: 'machine_learning_courses', channelTitle: 'AI and Machine Learning' });
ok(flFeed.courses.length === 1, 'file-list feed parses one course');
const cv = flFeed.courses[0];
ok(cv.parts.length === 7, `file-list parts parsed (${cv.parts.length})`);
ok(cv.sections.length === 6, `file-list modules grouped (${cv.sections.map((s) => s.title).join(' | ')})`);
const opencv = cv.sections.find((s) => s.title.startsWith('03.'));
ok(opencv !== undefined && opencv.parts.length === 2, 'OpenCV module has 2 parts from a list');


// --- HTML parse (if the saved t.me page is around) -----------------------
const htmlPath = process.env.TME_HTML_FIXTURE;
if (htmlPath && fs.existsSync(htmlPath)) {
  const html = fs.readFileSync(path.resolve(htmlPath), 'utf8');
  const hmsgs = parseTelegramHtml(html);
  ok(hmsgs.length > 0, `HTML parsed ${hmsgs.length} messages`);
  ok(hmsgs.every((m) => m.postId && m.postId.includes('/')), 'every HTML message has data-post');
  const hfeed = buildFeed(hmsgs, { channelUsername: 'zero_to_mastery', channelTitle: 'Zero To Mastery' });
  ok(hfeed.courses.length > 0, `HTML feed parsed ${hfeed.courses.length} courses`);
  console.log(`  ℹ HTML fixture: ${hfeed.courses.length} courses, ${hfeed.skipped} skipped`);
} else {
  console.log('  ℹ TME_HTML_FIXTURE not set — skipping HTML fixture assertions');
}

// --- organizeParts ordering -----------------------------------------------
const parts = [
  partFromFile('1. Introduction.zip', 1, null, null),
  partFromFile('2. Machine Learning 101.zip', 2, null, null),
];
const sections = organizeParts(parts);
ok(sections[0].title === '1. Introduction' && sections[1].title === '2. Machine Learning 101', 'sections keep first-seen order');

console.log(`\n✅ ${passed} assertions passed`);
process.exit(0);
