import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PaymentsService } from './payments.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EmailService } from '../email/email.service';

/**
 * The two money paths that had no tests and failed review: staff approval and
 * the provider webhook. Both are exercised against an in-memory stand-in for
 * Prisma so the conditional claim (the part that makes approval idempotent) is
 * the real code, not a reimplementation in the test.
 */

interface FakeUser {
  id: string;
  email: string;
  name: string;
  isStaff: boolean;
  planType: string;
  planExpiresAt: Date | null;
}

interface FakeSub {
  id: string;
  userId: string;
  planName: string;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
}

class FakeDb {
  users = new Map<string, FakeUser>();
  subs = new Map<string, FakeSub>();

  user = {
    findUnique: async ({ where }: { where: { id: string } }) => this.users.get(where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
      const user = this.users.get(where.id);
      if (!user) throw new Error('missing user');
      Object.assign(user, data);
      return user;
    },
  };

  subscription = {
    findUnique: async ({ where }: { where: { id: string } }) => this.subs.get(where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<FakeSub> }) => {
      const sub = this.subs.get(where.id);
      if (!sub) throw new Error('missing subscription');
      Object.assign(sub, data);
      return sub;
    },
    // Mirrors the conditional UPDATE in `activate`: only a row that is not
    // already approved is claimed, and the loser sees count 0.
    updateMany: async ({ where, data }: { where: { id: string }; data: Partial<FakeSub> }) => {
      const sub = this.subs.get(where.id);
      if (!sub || sub.status === 'approved') return { count: 0 };
      Object.assign(sub, data);
      return { count: 1 };
    },
  };

  $transaction = async <T>(fn: (tx: FakeDb) => Promise<T>): Promise<T> => fn(this);
}

function setup() {
  const db = new FakeDb();
  db.users.set('staff', {
    id: 'staff',
    email: 'staff@syncourse.app',
    name: 'Staff',
    isStaff: true,
    planType: 'free',
    planExpiresAt: null,
  });
  db.users.set('reader', {
    id: 'reader',
    email: 'reader@syncourse.app',
    name: 'Reader',
    isStaff: false,
    planType: 'free',
    planExpiresAt: null,
  });
  db.subs.set('sub1', {
    id: 'sub1',
    userId: 'reader',
    planName: '1m',
    status: 'pending',
    periodStart: null,
    periodEnd: null,
  });
  const email = { sendReceipt: async () => ({ sent: true }) };
  const service = new PaymentsService(
    db as unknown as PrismaService,
    email as unknown as EmailService,
  );
  return { db, service };
}

const status = (e: unknown) => (e as { getStatus?: () => number }).getStatus?.();
const daysAhead = (date: Date) => (date.getTime() - Date.now()) / (24 * 60 * 60 * 1000);

const withEnv = async (vars: Record<string, string | undefined>, run: () => Promise<void>) => {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await run();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

test('a reader cannot approve their own payment', async () => {
  const { db, service } = setup();
  await assert.rejects(
    () => service.verifySubscription('reader', 'sub1', true),
    (e) => status(e) === 403,
  );
  assert.equal(db.subs.get('sub1')?.status, 'pending');
  assert.equal(db.users.get('reader')?.planType, 'free');
});

test('staff approval grants the plan exactly once', async () => {
  const { db, service } = setup();
  await service.verifySubscription('staff', 'sub1', true);

  const sub = db.subs.get('sub1');
  const reader = db.users.get('reader');
  assert.equal(sub?.status, 'approved');
  assert.equal(reader?.planType, 'premium');
  assert.ok(reader?.planExpiresAt);
  assert.ok(Math.abs(daysAhead(reader.planExpiresAt) - 30) < 0.01);

  // A second click must not award another month.
  await assert.rejects(
    () => service.verifySubscription('staff', 'sub1', true),
    (e) => status(e) === 400,
  );
  assert.ok(Math.abs(daysAhead(db.users.get('reader')!.planExpiresAt!) - 30) < 0.01);
});

test('a replayed webhook acknowledges but does not extend the plan', async () => {
  const { db, service } = setup();
  await withEnv({ PAYMENTS_WEBHOOK_SECRET: 'shared-secret' }, async () => {
    const first = await service.webhookActivate('sub1', 'stripe', 'shared-secret');
    assert.deepEqual(first, { ok: true, provider: 'stripe' });
    const expiresAfterFirst = db.users.get('reader')!.planExpiresAt!.getTime();

    const replay = await service.webhookActivate('sub1', 'stripe', 'shared-secret');
    assert.deepEqual(replay, { ok: true, provider: 'stripe', duplicate: true });
    assert.equal(db.users.get('reader')!.planExpiresAt!.getTime(), expiresAfterFirst);
  });
});

test('a webhook with the wrong secret changes nothing', async () => {
  const { db, service } = setup();
  await withEnv({ PAYMENTS_WEBHOOK_SECRET: 'shared-secret' }, async () => {
    await assert.rejects(
      () => service.webhookActivate('sub1', 'stripe', 'guess'),
      (e) => status(e) === 401,
    );
    assert.equal(db.subs.get('sub1')?.status, 'pending');
    assert.equal(db.users.get('reader')?.planType, 'free');
  });
});

test('production fails closed when no webhook secret is configured', async () => {
  const { db, service } = setup();
  await withEnv({ PAYMENTS_WEBHOOK_SECRET: undefined, NODE_ENV: 'production' }, async () => {
    await assert.rejects(
      () => service.webhookActivate('sub1', 'stripe', 'anything'),
      (e) => status(e) === 401,
    );
    assert.equal(db.subs.get('sub1')?.status, 'pending');
  });
});
