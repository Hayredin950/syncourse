import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combineRating } from './rating';

test('a first local vote is appended to the imported source rating', () => {
  // 4.5 from 1,646 source votes + one 5 is still 4.5, not a single 5.
  const combined = combineRating({ baseAvg: 4.5, baseCount: 1646, localCount: 1, localSum: 5 });
  assert.equal(combined.count, 1647);
  assert.equal(combined.avg, 4.5);
});

test('the count grows and the average moves by one vote', () => {
  const combined = combineRating({ baseAvg: 4, baseCount: 10, localCount: 1, localSum: 1 });
  assert.equal(combined.count, 11);
  assert.equal(combined.avg, 3.73);
});

test('changing a vote replaces only that learner, not the whole total', () => {
  const first = combineRating({ baseAvg: 4.4, baseCount: 100, localCount: 2, localSum: 7 });
  const changed = combineRating({ baseAvg: 4.4, baseCount: 100, localCount: 2, localSum: 8 });
  assert.equal(first.count, changed.count);
  assert.equal(changed.avg, 4.39);
});

test('a course with no source rating starts from its local votes', () => {
  assert.deepEqual(
    combineRating({ baseAvg: 0, baseCount: 0, localCount: 2, localSum: 9 }),
    { avg: 4.5, count: 2 },
  );
});

test('an unrated course stays at zero instead of dividing by zero', () => {
  assert.deepEqual(combineRating({ baseAvg: 0, baseCount: 0, localCount: 0, localSum: 0 }), {
    avg: 0,
    count: 0,
  });
});
