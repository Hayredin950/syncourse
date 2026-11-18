import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLANS, premiumExpiresAt } from './plans';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-18T12:00:00.000Z');
const daysFrom = (date: Date, days: number) => new Date(date.getTime() + days * DAY);

test('plan ids keep their advertised duration', () => {
  const days = Object.fromEntries(PLANS.map((p) => [p.id, p.durationDays]));
  assert.deepEqual(days, { '1m': 30, '3m': 90, '6m': 182 });
});

test('a six-month purchase grants 182 days, not 30', () => {
  assert.equal(premiumExpiresAt(null, '6m', NOW).toISOString(), daysFrom(NOW, 182).toISOString());
});

test('buying while active stacks on the remaining time', () => {
  const expires = daysFrom(NOW, 10);
  assert.equal(premiumExpiresAt(expires, '1m', NOW).toISOString(), daysFrom(NOW, 40).toISOString());
});

test('buying after expiry starts from now, not from the lapsed date', () => {
  const lapsed = daysFrom(NOW, -10);
  assert.equal(premiumExpiresAt(lapsed, '3m', NOW).toISOString(), daysFrom(NOW, 90).toISOString());
});

test('an unknown plan id falls back to the shortest paid period', () => {
  assert.equal(premiumExpiresAt(null, 'legacy_monthly', NOW).toISOString(), daysFrom(NOW, 30).toISOString());
});
