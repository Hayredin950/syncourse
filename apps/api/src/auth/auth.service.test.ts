import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EmailService } from '../email/email.service';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';

/**
 * /auth/verify was an account-takeover endpoint: it minted a session for any
 * six-digit code, including for accounts that were already verified. These
 * tests pin the two halves of the fix — a verified account is refused, and the
 * attempt counter really locks the code — plus the happy path.
 */

interface FakeUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  gender: string | null;
  isVerified: boolean;
  planType: string;
  planExpiresAt: Date | null;
  telegramUsername: string | null;
  isStaff: boolean;
  verifyCode: string | null;
  verifyExpiresAt: Date | null;
  verifyAttempts: number;
  verifySentAt: Date | null;
}

function user(overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id: 'u1',
    name: 'Reader',
    username: 'reader',
    email: 'reader@syncourse.app',
    avatarUrl: null,
    gender: null,
    isVerified: false,
    planType: 'free',
    planExpiresAt: null,
    telegramUsername: null,
    isStaff: false,
    verifyCode: '123456',
    verifyExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    verifyAttempts: 0,
    verifySentAt: new Date(),
    ...overrides,
  };
}

class FakeDb {
  rows: FakeUser[] = [];
  sessions: Array<{ id: string; userId: string; device: string; active: boolean }> = [];

  user = {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
      this.rows.find((u) => (where.email ? u.email === where.email : u.id === where.id)) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
      const row = this.rows.find((u) => u.id === where.id);
      if (!row) throw new Error('missing user');
      Object.assign(row, data);
      return row;
    },
  };

  session = {
    create: async ({ data }: { data: { userId: string; device: string; active: boolean } }) => {
      const row = { id: `s${this.sessions.length + 1}`, ...data };
      this.sessions.push(row);
      return row;
    },
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  };
}

function setup(rows: FakeUser[]) {
  const db = new FakeDb();
  db.rows = rows;
  const jwt = { sign: () => 'signed-token' };
  const email = { sendVerificationCode: async () => ({ sent: true }) };
  const config = { get: (_key: string, fallback?: string) => fallback ?? '' };
  const service = new AuthService(
    db as unknown as PrismaService,
    jwt as unknown as JwtService,
    email as unknown as EmailService,
    config as unknown as ConfigService,
  );
  return { db, service };
}

const status = (e: unknown) => (e as { getStatus?: () => number }).getStatus?.();

test('a verified account cannot be signed in through /auth/verify', async () => {
  const { db, service } = setup([user({ isVerified: true })]);
  await assert.rejects(
    () => service.verify('reader@syncourse.app', '000000'),
    (e) => status(e) === 400,
  );
  assert.equal(db.sessions.length, 0);
});

test('the correct code verifies the account and opens a session', async () => {
  const { db, service } = setup([user()]);
  const res = (await service.verify('Reader@Syncourse.app', '123456')) as { accessToken: string };

  assert.equal(res.accessToken, 'signed-token');
  assert.equal(db.rows[0].isVerified, true);
  assert.equal(db.rows[0].verifyCode, null);
  assert.equal(db.sessions.length, 1);
  assert.equal(db.sessions[0].active, true);
});

test('five wrong codes invalidate the code even if the sixth guess is right', async () => {
  const { db, service } = setup([user()]);

  for (let i = 0; i < 4; i++) {
    await assert.rejects(
      () => service.verify('reader@syncourse.app', '999999'),
      (e) => status(e) === 400,
    );
  }
  await assert.rejects(
    () => service.verify('reader@syncourse.app', '999999'),
    (e) => status(e) === 400,
  );
  assert.equal(db.rows[0].verifyCode, null, 'the fifth miss burns the code');
  assert.equal(db.sessions.length, 0);

  await assert.rejects(
    () => service.verify('reader@syncourse.app', '123456'),
    (e) => status(e) === 400,
  );
  assert.equal(db.sessions.length, 0);
});

test('an expired code is refused', async () => {
  const { db, service } = setup([user({ verifyExpiresAt: new Date(Date.now() - 1000) })]);
  await assert.rejects(
    () => service.verify('reader@syncourse.app', '123456'),
    (e) => status(e) === 400,
  );
  assert.equal(db.sessions.length, 0);
});
