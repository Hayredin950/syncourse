import assert from 'node:assert/strict';
import test from 'node:test';
import { expandKeywords, keywordsOf } from './retrieval/retrieval.service';
import {
  cleanHistory,
  isRecommendationQuestion,
  retrievalQuery,
} from './assistant.service';
import { isProductQuestion, productAnswer } from './product';

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
  assert.equal(isProductQuestion('how do I build a web app with React'), false);
  assert.equal(isProductQuestion('which course should i take to master mobile app development'), false);
});

test('the product answer talks about the catalogue, not about courses', () => {
  const answer = productAnswer();
  assert.match(answer, /Syncourse/i);
  assert.match(answer, /catalogue/i);
  assert.doesNotMatch(answer, /\[1\]/, 'product facts are not cited course files');
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
