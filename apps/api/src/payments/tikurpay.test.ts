import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { TikurPayClient } from './tikurpay.client';
import type { PrismaService } from '../prisma/prisma.service';
import type { EmailService } from '../email/email.service';

/**
 * The payment rail that moves real money, tested where the fraud checks live.
 *
 * There are two kinds of test here. The first covers the client's own logic —
 * reference normalisation and webhook HMAC verification — because both are pure
 * functions guarding the two ways a caller could lie. The second drives
 * `tikurVerify` against an in-memory database and a fake gateway, so the
 * decisions that actually unlock Premium (amount, duplicate receipt, exactly
 * one activation) are the production code, not a re-implementation.
 */

// --- client: normalisation and signatures ------------------------------------

test('normalizeReference folds the same receipt into one key', () => {
  const n = (s: string) => TikurPayClient.normalizeReference(s);
  // A bank receipt link is copied with a query string, a fragment, a trailing
  // slash, or wrapped in whitespace — all the same proof of one transfer.
  assert.equal(n('  FT26ABC12345  '), 'ft26abc12345');
  assert.equal(n('HTTPS://mbreciept.cbe.com.et/FT26ABC12345/?x=1#top'), 'https://mbreciept.cbe.com.et/ft26abc12345');
  assert.equal(n('https://mbreciept.cbe.com.et/FT26ABC12345/'), n('https://mbreciept.cbe.com.et/FT26ABC12345'));
  // Different transfers must stay different.
  assert.notEqual(n('FT26ABC12345'), n('FT26ABC12346'));
});

test('verifyWebhook accepts only the exact signed bytes', () => {
  const client = new TikurPayClient();
  const previous = process.env.TIKURPAY_WEBHOOK_SECRET;
  process.env.TIKURPAY_WEBHOOK_SECRET = 'unit-test-secret';
  try {
    // Spaced JSON: re-serialising the parsed object drops the whitespace, so
    // the signature of the original no longer matches. This is why main.ts
    // keeps the raw body instead of hashing `JSON.stringify(body)`.
    const body = Buffer.from('{"status": "completed", "payment_number": "pay_1"}');
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');
    const good = createHmac('sha256', 'unit-test-secret').update(body).digest('hex');

    assert.equal(client.verifyWebhook(body, good), true);
    // The docs show the header both bare and prefixed.
    assert.equal(client.verifyWebhook(body, `sha256=${good}`), true);
    assert.equal(client.verifyWebhook(body, 'deadbeef'), false);
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(body.toString())));
    assert.equal(client.verifyWebhook(reserialised, good), false);
    // Missing anything fails closed.
    assert.equal(client.verifyWebhook(undefined, good), false);
    assert.equal(client.verifyWebhook(body, undefined), false);
    process.env.TIKURPAY_WEBHOOK_SECRET = '';
    assert.equal(client.verifyWebhook(body, good), false);
  } finally {
    if (previous === undefined) delete process.env.TIKURPAY_WEBHOOK_SECRET;
    else process.env.TIKURPAY_WEBHOOK_SECRET = previous;
  }
});

// --- service: what a verified receipt is allowed to do -----------------------

interface SubRow {
  id: string;
  userId: string;
  planName: string;
  status: string;
  amount: number;
  currency: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  txReference?: string | null;
}

interface PaymentRow {
  id: string;
  subscriptionId: string;
  paymentNumber: string;
  amount: number;
  currency: string;
  status: string;
  reference: string | null;
  expiresAt: Date | null;
  verifiedAt: Date | null;
  payerName?: string | null;
  bankCode?: string | null;
  verificationId?: string | null;
  raw?: unknown;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  planType: string;
  planExpiresAt: Date | null;
}

/** A small relational stand-in that mirrors the conditional update semantics. */
class FakeDb {
  subs = new Map<string, SubRow>();
  payments = new Map<string, PaymentRow>();
  refs = new Map<string, { reference: string }>();
  users = new Map<string, UserRow>();
  private seq = 0;

  /** Mimics the relation `include: { subscription: true }`. */
  private withSub(p: PaymentRow) {
    return { ...p, subscription: this.subs.get(p.subscriptionId) };
  }

  subscription = {
    findUnique: async ({ where }: { where: { id: string } }) => this.subs.get(where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<SubRow> }) => {
      const sub = this.subs.get(where.id);
      if (!sub) throw new Error('missing subscription');
      Object.assign(sub, data);
      return sub;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; status?: { not: string } };
      data: Partial<SubRow>;
    }) => {
      const sub = this.subs.get(where.id);
      if (!sub) return { count: 0 };
      if (where.status?.not && sub.status === where.status.not) return { count: 0 };
      Object.assign(sub, data);
      return { count: 1 };
    },
  };

  tikurPayment = {
    findUnique: async ({
      where,
    }: {
      where: { id?: string; subscriptionId?: string; paymentNumber?: string };
      include?: unknown;
    }) => {
      let row: PaymentRow | undefined;
      if (where.id) row = this.payments.get(where.id);
      else if (where.subscriptionId)
        row = [...this.payments.values()].find((p) => p.subscriptionId === where.subscriptionId);
      else if (where.paymentNumber)
        row = [...this.payments.values()].find((p) => p.paymentNumber === where.paymentNumber);
      return row ? this.withSub(row) : null;
    },
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      const row = this.payments.get(where.id);
      if (!row) throw new Error('missing payment');
      return this.withSub(row);
    },
    findFirst: async ({
      where,
    }: {
      where: { reference: string; NOT?: { id: string } };
    }) => {
      const row = [...this.payments.values()].find(
        (p) => p.reference === where.reference && p.id !== where.NOT?.id,
      );
      return row ?? null;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; status?: string | { not: string } };
      data: Partial<PaymentRow>;
    }) => {
      const row = this.payments.get(where.id);
      if (!row) return { count: 0 };
      if (typeof where.status === 'string' && row.status !== where.status) return { count: 0 };
      if (typeof where.status === 'object' && where.status.not && row.status === where.status.not) {
        return { count: 0 };
      }
      Object.assign(row, data);
      return { count: 1 };
    },
    create: async ({ data }: { data: Omit<PaymentRow, 'id'> }) => {
      const row: PaymentRow = { id: `tp_${++this.seq}`, ...data } as PaymentRow;
      this.payments.set(row.id, row);
      return row;
    },
  };

  paymentReference = {
    create: async ({ data }: { data: { reference: string } }) => {
      // The real table has a unique index on `reference`.
      if (this.refs.has(data.reference)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
        });
      }
      this.refs.set(data.reference, data);
      return data;
    },
  };

  user = {
    findUnique: async ({ where }: { where: { id: string } }) => this.users.get(where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
      const user = this.users.get(where.id);
      if (!user) throw new Error('missing user');
      Object.assign(user, data);
      return user;
    },
  };

  $transaction = async <T>(fn: (tx: FakeDb) => Promise<T>): Promise<T> => fn(this);
}

class FakeTikur {
  configured = true;
  timeoutMinutes = 15;
  rails = {};
  verifyResult: Record<string, unknown> = {
    success: true,
    status: 'completed',
    amount: 149,
    verificationId: 'FT26OK0001',
    payerName: 'Test Payer',
  };
  verifyCalls = 0;

  async verifyReceipt() {
    this.verifyCalls += 1;
    return this.verifyResult;
  }
}

function setup() {
  const db = new FakeDb();
  db.users.set('reader', {
    id: 'reader',
    email: 'reader@syncourse.app',
    name: 'Reader',
    planType: 'free',
    planExpiresAt: null,
  });
  db.subs.set('sub1', {
    id: 'sub1',
    userId: 'reader',
    planName: '1m',
    status: 'pending',
    amount: 149,
    currency: 'ETB',
    periodStart: null,
    periodEnd: null,
  });
  db.payments.set('tp_1', {
    id: 'tp_1',
    subscriptionId: 'sub1',
    paymentNumber: 'pay_1',
    amount: 149,
    currency: 'ETB',
    status: 'pending',
    reference: null,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    verifiedAt: null,
  });

  const tikur = new FakeTikur();
  const email = { sendReceipt: async () => ({ sent: true }) };
  const service = new PaymentsService(
    db as unknown as PrismaService,
    email as unknown as EmailService,
    tikur as unknown as TikurPayClient,
  );
  return { db, tikur, service };
}

test('a verified receipt for the right amount unlocks Premium exactly once', async () => {
  const { db, service } = setup();

  const first = await service.tikurVerify('reader', 'sub1', 'FT26OK0001');
  assert.equal(first.status, 'completed');
  assert.equal(db.users.get('reader')?.planType, 'premium');
  assert.equal(db.subs.get('sub1')?.status, 'approved');
  assert.ok((db.users.get('reader')?.planExpiresAt?.getTime() ?? 0) > Date.now());

  // Submitting again is a no-op, not a second month.
  const expiry = db.users.get('reader')?.planExpiresAt?.getTime();
  const second = await service.tikurVerify('reader', 'sub1', 'FT26OK0001');
  assert.equal(second.status, 'completed');
  assert.equal(second.duplicate, true);
  assert.equal(db.users.get('reader')?.planExpiresAt?.getTime(), expiry);
});

test('a transfer for the wrong amount is refused and unlocks nothing', async () => {
  const { db, tikur, service } = setup();
  // Someone pays 10 ETB into a 149 ETB order.
  tikur.verifyResult = { success: true, status: 'completed', amount: 10, verificationId: 'FT26CHEAP' };

  await assert.rejects(() => service.tikurVerify('reader', 'sub1', 'FT26CHEAP'), /149/);
  assert.equal(db.users.get('reader')?.planType, 'free');
  assert.equal(db.subs.get('sub1')?.status, 'pending');
  assert.equal(db.payments.get('tp_1')?.status, 'pending');
});

test('a receipt already claimed by another account cannot be reused', async () => {
  const { db, tikur, service } = setup();
  // Another payment settled earlier with this exact reference.
  db.payments.set('tp_other', {
    id: 'tp_other',
    subscriptionId: 'sub_other',
    paymentNumber: 'pay_other',
    amount: 149,
    currency: 'ETB',
    status: 'completed',
    reference: 'ft26stolen',
    expiresAt: null,
    verifiedAt: new Date(),
  });

  await assert.rejects(() => service.tikurVerify('reader', 'sub1', 'FT26STOLEN'), /already been used/);
  // The cheap pre-check stops it before the gateway call is even made.
  assert.equal(tikur.verifyCalls, 0);
  assert.equal(db.users.get('reader')?.planType, 'free');
});

test('an expired checkout cannot be paid into', async () => {
  const { db, service } = setup();
  db.payments.get('tp_1')!.expiresAt = new Date(Date.now() - 1000);

  await assert.rejects(() => service.tikurVerify('reader', 'sub1', 'FT26LATE'), /window has closed/);
  assert.equal(db.payments.get('tp_1')?.status, 'expired');
  assert.equal(db.users.get('reader')?.planType, 'free');
});

test('a gateway that says "not paid" grants nothing', async () => {
  const { db, tikur, service } = setup();
  tikur.verifyResult = { success: false, status: 'pending', message: 'No matching transfer yet' };

  await assert.rejects(() => service.tikurVerify('reader', 'sub1', 'FT26WAIT'), /No matching transfer/);
  assert.equal(db.users.get('reader')?.planType, 'free');
});

test('someone else\'s subscription id cannot be paid into', async () => {
  const { service } = setup();
  await assert.rejects(() => service.tikurVerify('stranger', 'sub1', 'FT26X'), /not found/i);
});
