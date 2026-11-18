/**
 * draft-parser.test.ts — assertions for the group watcher's rule engine.
 *
 * Run with:  npx tsx apps/api/src/telegram-ingest/draft-parser.test.ts
 *
 * Pure: no database, no network. The fixture is the announcement shape the
 * group actually uses, so a change that stops recognising it fails here before
 * it reaches production.
 */
import * as assert from 'assert';
import {
  announcementSignals,
  categorize,
  cleanFileName,
  confidenceFrom,
  draftSlug,
  moduleFromFile,
  nextPartIndex,
  parseAnnouncement,
} from './draft-parser';

let passed = 0;
function ok(cond: boolean, name: string) {
  assert.ok(cond, name);
  passed++;
  console.log(`  ✓ ${name}`);
}

const ANNOUNCEMENT = `🔰 The Complete AI Engineering Bootcamp 2026
Taught By: Andrei Neagoie, Daniel Bourke
⏱ 42 Hours
📦 312 Lessons
🌟 4.8 - 8,341 votes
💰 Original Price: $129
#ai #python #machinelearning
Download Full Course
https://t.me/syncourse/1841`;

// --- detection --------------------------------------------------------
const parsed = parseAnnouncement({
  text: ANNOUNCEMENT,
  postedAt: new Date('2026-11-17T10:00:00Z'),
  links: ['https://t.me/syncourse/1841'],
});
ok(parsed !== null, 'recognises a course announcement');
ok(parsed?.title === 'The Complete AI Engineering Bootcamp 2026', `title: ${parsed?.title}`);
ok(parsed?.taughtBy.length === 2, `two lecturers: ${parsed?.taughtBy.join(', ')}`);
ok(parsed?.durationMin === 42 * 60, 'hours → durationMin');
ok(parsed?.lessonCount === 312, 'lesson count');
ok(parsed?.originalPrice === 129, 'price');
ok(Boolean(parsed?.hashtags.includes('python')), 'hashtags');
ok(parsed?.sourceUrl === 'https://t.me/syncourse/1841', 'source link');

// Ordinary chatter must not become a draft.
ok(
  parseAnnouncement({ text: 'thanks bro 🙏', postedAt: null, links: [] }) === null,
  'ignores chatter',
);
ok(
  parseAnnouncement({
    text: 'Selling my old laptop, 8GB RAM, $200',
    postedAt: null,
    links: [],
  }) === null,
  'ignores a for-sale post (price alone is not enough)',
);
ok(
  parseAnnouncement({
    text: '🔰 Some Random Post\nDownload Full Course\nhttps://t.me/x/1',
    postedAt: null,
    links: [],
  }) !== null,
  'a download line is enough on its own',
);

// --- confidence -------------------------------------------------------
const signals = announcementSignals(ANNOUNCEMENT, parsed!);
const strong = confidenceFrom(signals, parsed!);
const weak = confidenceFrom(
  ['download-line'],
  parseAnnouncement({
    text: '🔰 Some Random Post\nDownload Full Course',
    postedAt: null,
    links: [],
  })!,
);
ok(signals.includes('taught-by') && signals.includes('hours'), `signals: ${signals.join(', ')}`);
ok(strong > weak, `strong post (${strong}) scores above a bare one (${weak})`);
ok(strong <= 0.99, 'confidence stays below certainty');

// --- categories -------------------------------------------------------
const cats = categorize({
  title: parsed!.title,
  description: parsed!.description,
  hashtags: parsed!.hashtags,
  fileNames: ['12. Fine Tuning LLMs - Part 01.zip'],
});
ok(cats.includes('ai-machine-learning'), `AI/ML from hashtag/keyword: ${cats.join(', ')}`);
ok(cats.includes('programming'), 'programming from #python');
ok(cats.length <= 3, 'at most three categories');

const quran = categorize({
  title: 'تفسير سورة الواقعة',
  description: 'tafseer quran',
  hashtags: [],
  fileNames: ['تفسير سورة الواقعة 1.mp3'],
});
ok(quran.includes('quran-tafseer'), `Quran course classified: ${quran.join(', ')}`);

const flutter = categorize({
  title: 'Dart and Flutter: The Complete Developer Guide',
  description: 'build mobile apps',
  hashtags: [],
  fileNames: [],
});
ok(flutter.includes('mobile-development'), `Flutter → mobile: ${flutter.join(', ')}`);

// Topic override wins and still respects the cap.
const overridden = categorize({
  title: 'Some Course',
  description: '',
  hashtags: [],
  fileNames: [],
  topicOverride: 'design',
});
ok(overridden[0] === 'design', 'topic override is applied');

// --- file names -------------------------------------------------------
const m1 = moduleFromFile('8. Matplotlib Plotting and Data Visualization - Part 01.zip', 0);
ok(m1.moduleTitle === '8. Matplotlib Plotting and Data Visualization', `module: ${m1.moduleTitle}`);
ok(m1.partIndex === 1, 'part 1');

const m2 = moduleFromFile('14_Neural_Networks_and_TensorFlow.zip', 1);
ok(m2.moduleTitle === '14. Neural Networks and TensorFlow', `underscore module: ${m2.moduleTitle}`);

const files = [
  { messageId: 1, fileId: 'a', fileName: 'x - Part 01.zip', fileSizeMb: 10, mimeType: null, moduleTitle: 'X', partIndex: 1, addedAt: '' },
  { messageId: 2, fileId: 'b', fileName: 'x - Part 03.zip', fileSizeMb: 10, mimeType: null, moduleTitle: 'X', partIndex: 3, addedAt: '' },
];
ok(nextPartIndex(files, 'X') === 2, 'fills the gap in a module');
ok(nextPartIndex(files, 'Y', 7) === 7, 'a first part keeps the number in its filename');
ok(nextPartIndex(files, 'Y') === 1, 'a first part with no number is 1');
ok(nextPartIndex(files, 'X', 3) === 2, 'never reuses a claimed number');

// --- names ------------------------------------------------------------
ok(cleanFileName('../../etc/passwd') === 'passwd', 'strips a path');
ok(cleanFileName('  course.zip  ') === 'course.zip', 'trims whitespace');
ok(draftSlug('AI & Machine Learning') === 'ai-and-machine-learning', 'slugify for approval');

console.log(`\n${passed} assertions passed`);
