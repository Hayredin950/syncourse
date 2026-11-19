import assert from 'node:assert/strict';
import test from 'node:test';
import { expandKeywords, keywordsOf } from './retrieval/retrieval.service';
import {
  cleanHistory,
  isRecommendationQuestion,
  retrievalQuery,
} from './assistant.service';
import {
  canonicalQuestion,
  isProductQuestion,
  isSystemQuestion,
  productAnswer,
  systemQuestionStrength,
} from './product';

/**
 * Pure checks for the retrieval helpers. They run without a database or an LLM
 * key, so they are safe on every push; the end-to-end behaviour is covered by
 * prisma/assistant-check.ts.
 */

test('generic words are dropped from the subject', () => {
  const words = keywordsOf('which course should i take to master mobile app development');
  assert.ok(words.includes('mobile'));
  assert.ok(words.includes('development'));
  assert.ok(!words.includes('app'));
  assert.ok(!words.includes('course'));
});

test('a subject expands to the technologies that teach it', () => {
  const words = expandKeywords('which course should i take to master mobile app development');
  for (const expected of ['flutter', 'dart', 'android', 'ios']) {
    assert.ok(words.includes(expected), `${expected} missing from ${words.join(', ')}`);
  }
  assert.equal(words[0], 'mobile', 'the reader’s own words stay first');
});

test('dart is not left to stand alone', () => {
  const words = expandKeywords('how can i master dart');
  assert.ok(words.includes('dart'));
  assert.ok(words.includes('flutter'));
});

test('recommendation questions are recognised', () => {
  assert.equal(isRecommendationQuestion('which course should i take to master mobile app development'), true);
  assert.equal(isRecommendationQuestion('how can i master dart and were can you seggest me acourse'), true);
  assert.equal(isRecommendationQuestion('can you recommend a Flutter course'), true);
  assert.equal(isRecommendationQuestion('How do I build a RAG pipeline?'), false);
});

test('product questions are told apart from course questions', () => {
  assert.equal(isProductQuestion('can you tell me about this web app what it does'), true);
  assert.equal(isProductQuestion('im asking about this website https://syncourse.pages.dev/'), true);
  assert.equal(isProductQuestion('what does Syncourse do?'), true);
  assert.equal(isProductQuestion('does Syncourse have a Dart course?'), false);
  assert.equal(isProductQuestion('what courses are in the Syncourse catalogue?'), false);
  assert.equal(isProductQuestion('how do I build a web app with React'), false);
  assert.equal(isProductQuestion('which course should i take to master mobile app development'), false);
});

test('system questions survive the spellings readers type', () => {
  assert.equal(
    isSystemQuestion('what is the differnce between full corse and minicouse in syncourse'),
    true,
  );
  assert.equal(isSystemQuestion('What is the difference between a full course and a mini-course?'), true);
  assert.equal(isSystemQuestion('Are there any free alternatives to premium courses on the same topic?'), true);
  assert.equal(isSystemQuestion('any question i ask shows this message is it request limit or what'), true);
  assert.equal(isSystemQuestion('how do i download a course'), true);
  assert.equal(isSystemQuestion('do i need an account to save a course'), true);
  assert.equal(isSystemQuestion('how do circles work'), true);
  assert.equal(systemQuestionStrength('how do i download a course'), 'strong');
  assert.equal(systemQuestionStrength('what is the difference between a full course and a mini-course?'), 'strong');
});

test('ambiguous platform words let the catalogue answer first', () => {
  // These words are ordinary course subjects too. Retrieval gets the first
  // attempt; product knowledge is only the fallback.
  assert.equal(systemQuestionStrength('how do circles work'), 'weak');
  assert.equal(systemQuestionStrength('how do ratings work'), 'weak');
  assert.equal(systemQuestionStrength('what is premium'), 'strong');
});

test('a technical subject keeps even a weak platform word in the catalogue', () => {
  assert.equal(systemQuestionStrength('how do collections work in Java'), null);
  assert.equal(systemQuestionStrength('how do ratings work in recommender systems'), null);
  assert.equal(systemQuestionStrength('what is premium pricing in economics'), null);
  assert.equal(systemQuestionStrength('how do I build an android app'), null);
});

test('system detection does not steal course-subject questions', () => {
  assert.equal(isSystemQuestion('does Syncourse have a Dart course?'), false);
  assert.equal(isSystemQuestion('how do I build a web app with React'), false);
  assert.equal(isSystemQuestion('how do I download a file in Python'), false);
  assert.equal(isSystemQuestion('what is quantum chromodynamics for basket weavers'), false);
});

test('canonicalQuestion maps common misspellings without rewriting other words', () => {
  assert.match(canonicalQuestion('full corse and minicouse'), /full course and mini course/);
  assert.match(canonicalQuestion('cource'), /course/);
  assert.doesNotMatch(canonicalQuestion('curse'), /course/);
});

test('the product answer talks about the catalogue, not about courses', () => {
  const answer = productAnswer();
  assert.match(answer, /Syncourse/i);
  assert.match(answer, /catalogue/i);
  assert.doesNotMatch(answer, /\[1\]/, 'product facts are not cited course files');
});

test('a specific product question gets a specific answer', () => {
  const answer = productAnswer('what is the difference between full course and mini-course in syncourse');
  assert.match(answer, /Full course/i);
  assert.match(answer, /mini-course/i);
  assert.match(answer, /90 minutes/i);
  assert.doesNotMatch(answer, /Apps for Android/i, 'not the same overview paragraph every time');
});

test('free alternatives get the premium answer, not the overview', () => {
  const answer = productAnswer('Are there any free alternatives to premium courses on the same topic?');
  assert.match(answer, /Premium/i);
  assert.match(answer, /free alternative/i);
  assert.doesNotMatch(answer, /roadmaps that put them in order/i);
});

test('follow-ups inherit the previous subject', () => {
  const history = [{ role: 'user' as const, content: 'How do n8n workflows handle webhooks?' }];
  assert.match(retrievalQuery('and the second one?', history), /n8n/);
  assert.equal(retrievalQuery('how do I install Flutter?', history), 'how do I install Flutter?');
});

test('history is trimmed to the prompt budget', () => {
  const cleaned = cleanHistory(
    Array.from({ length: 20 }, (_, i) => ({ role: 'user' as const, content: `question ${i}` })),
  );
  assert.equal(cleaned.length, 8);
  assert.equal(cleaned.at(-1)?.content, 'question 19');
});
