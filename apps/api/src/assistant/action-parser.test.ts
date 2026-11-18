/**
 * action-parser.test.ts — the grammar the assistant's write mode accepts.
 *
 *   npm run test:actions -w apps/api
 *
 * Every case here is a sentence a person might actually type. The point of the
 * test is the negative space: an ambiguous sentence must produce `null` so the
 * assistant replies with the syntax instead of inventing a course.
 */
import * as assert from 'assert';
import { isTelegramLink, parseInstruction, parsePrice, summarize } from './action-parser';

let passed = 0;
function ok(cond: boolean, name: string) {
  assert.ok(cond, name);
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('\ncreate course');

const piped = parseInstruction(
  'create course Complete Flutter | Stephen Grider | mobile-development | 49.99 | course | Build real apps',
);
ok(piped?.kind === 'create_course', 'pipe form is a course');
ok(piped?.fields.title === 'Complete Flutter', 'title is the first field');
ok(piped?.fields.instructor === 'Stephen Grider', 'instructor is the second field');
ok(piped?.fields.category === 'mobile-development', 'category is the third field');
ok(piped?.fields.price === 49.99, 'price is parsed to a number');
ok(piped?.fields.contentType === 'course', 'type is kept');
ok(piped?.fields.description === 'Build real apps', 'description is the last field');

const by = parseInstruction('Add a course "Flutter Bootcamp" by Stephen Grider');
ok(by?.kind === 'create_course', '"Title by Instructor" is a course');
ok(by?.fields.title === 'Flutter Bootcamp', 'quotes are stripped from the title');
ok(by?.fields.instructor === 'Stephen Grider', 'the name after "by" is the instructor');

ok(parseInstruction('/new course: Kotlin Basics | Ana Silva')?.fields.title === 'Kotlin Basics', 'a leading slash is ignored');
ok(parseInstruction('make course Kotlin Basics by Ana Silva')?.kind === 'create_course', '"make course" is accepted');
ok(parseInstruction('create course Flutter by') === null, '"by" with no instructor is ambiguous');
ok(parseInstruction('create course A by B') === null, 'a one-letter title is rejected');

console.log('\ncreate resource');

const resource = parseInstruction('create resource Figma shortcuts | alt+drag duplicates | cheat-sheet');
ok(resource?.kind === 'create_resource', 'pipe form is a resource');
ok(resource?.fields.title === 'Figma shortcuts', 'resource title');
ok(resource?.fields.body === 'alt+drag duplicates', 'resource body');
ok(resource?.fields.resourceType === 'cheat-sheet', 'resource type');

const roadmap = parseInstruction('add resource Flutter roadmap | 12 steps | roadmap');
ok(roadmap?.fields.resourceType === 'roadmap', 'roadmap type is carried to validation');
ok(parseInstruction('create resource') === null, 'a resource with no title is not an action');

console.log('\nattach file');

const attach = parseInstruction('attach https://t.me/syncourse/4123 to complete-flutter');
ok(attach?.kind === 'attach_file', 'attach is an action');
ok(attach?.fields.url === 'https://t.me/syncourse/4123', 'the link is the url');
ok(attach?.fields.slug === 'complete-flutter', 'the course slug follows "to"');

const link = parseInstruction('link t.me/syncourse/99 on kotlin-basics');
ok(link?.kind === 'attach_file', '"link … on …" is accepted');
ok(link?.fields.slug === 'kotlin-basics', 'course slug after "on"');
ok(parseInstruction('attach to complete-flutter') === null, 'no link, no action');

console.log('\npublish draft');

const publish = parseInstruction('publish draft ab12cd34');
ok(publish?.kind === 'publish_draft', 'publish is an action');
ok(publish?.fields.draftId === 'ab12cd34', 'the draft id is captured');
ok(parseInstruction('approve draft 9f3c2a11')?.kind === 'publish_draft', '"approve draft" is the same action');
ok(parseInstruction('publish draft') === null, 'publishing needs an id');

console.log('\nnegative space');

for (const sentence of [
  'make me a course about Flutter',
  'add something useful',
  'can you delete the old course?',
  'what courses do you have on React?',
  '',
]) {
  ok(parseInstruction(sentence) === null, `not an action: "${sentence || '(empty)'}"`);
}

console.log('\nhelpers');

ok(parsePrice('free') === null, '"free" is null, not zero');
ok(parsePrice('$1,299') === 1299, 'currency symbols and separators are stripped');
ok(parsePrice('') === undefined, 'an empty price is unstated');
ok(parsePrice('abc') === undefined, 'unreadable price is unstated');
ok(isTelegramLink('https://t.me/syncourse/1'), 'https t.me link');
ok(!isTelegramLink('https://example.com/a.zip'), 'a normal url is not a telegram link');

ok(
  summarize('create_course', { title: 'Flutter', instructor: 'Stephen', price: null }) ===
    'Create course “Flutter” by Stephen as free.',
  'summary states the price as free',
);
ok(
  summarize('create_resource', { title: 'Figma', resourceType: 'cheat-sheet' }) ===
    'Create cheat-sheet “Figma”.',
  'summary names the resource type',
);
ok(
  summarize('attach_file', { url: 'https://t.me/g/1', slug: 'flutter' }) ===
    'Attach https://t.me/g/1 to the course “flutter”.',
  'summary names the target course',
);
ok(summarize('publish_draft', { draftId: 'ab12cd34' }) === 'Publish draft ab12cd34.', 'summary names the draft');

console.log(`\n${passed} checks passed\n`);
