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
  extractFields,
  mediaName,
  mediaRole,
  parseResourcePost,
  resourceTypeOf,
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
ok(mediaRole(null, [{ role: 'cover', fileId: 'x', messageId: 1, caption: null }]) === null, 'second uncaptioned photo is ignored');
ok(mediaRole('Lecturer photo', []) === 'lecturer', 'caption "lecturer photo"');
ok(mediaRole('org: Udemy', []) === 'organization', 'caption "org: Udemy"');
ok(mediaRole('random cat', []) === null, 'unrelated caption names no role');
ok(mediaName('lecturer: Stephen Grider') === 'Stephen Grider', 'lecturer name from caption');
ok(mediaName('org: Udemy') === 'Udemy', 'organisation name from caption');

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

console.log(`\n${passed} checks passed\n`);
