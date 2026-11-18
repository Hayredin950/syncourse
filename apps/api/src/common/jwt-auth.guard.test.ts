import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * The guard is the one place that decides whether a token is still worth
 * anything. Two regressions from the review are pinned here: @Public() routes
 * must still populate `request.user` from a bearer token (otherwise saved,
 * liked, isOwner and join state are permanently false), and a token whose
 * session row is gone or inactive must not open a protected route.
 */

const sessions = new Map<string, { userId: string; active: boolean }>();

const prisma = {
  session: {
    findUnique: async ({ where }: { where: { id: string } }) => sessions.get(where.id) ?? null,
  },
};

const jwt = {
  verifyAsync: async (token: string) => {
    if (token === 'bad') throw new Error('invalid');
    if (token === 'reset') return { sub: 'u1', purpose: 'reset' };
    if (token === 'legacy') return { sub: 'u1', email: 'a@b.c', username: 'a' };
    if (token === 'stale') return { sub: 'u1', sid: 's-stale' };
    return { sub: 'u1', email: 'a@b.c', username: 'a', sid: 's-live' };
  },
};

const guardFor = (isPublic: boolean) =>
  new JwtAuthGuard(
    { getAllAndOverride: () => isPublic } as unknown as Reflector,
    jwt as unknown as JwtService,
    prisma as unknown as PrismaService,
  );

const context = (token?: string) => {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  return {
    request,
    ctx: {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
};

const status = (e: unknown) => (e as { getStatus?: () => number }).getStatus?.();

test.beforeEach(() => {
  sessions.clear();
  sessions.set('s-live', { userId: 'u1', active: true });
  sessions.set('s-stale', { userId: 'u1', active: false });
});

test('a public route stays open and still resolves the viewer', async () => {
  const { ctx, request } = context('good');
  assert.equal(await guardFor(true).canActivate(ctx), true);
  assert.deepEqual(request.user, { id: 'u1', email: 'a@b.c', username: 'a', sessionId: 's-live' });
});

test('a public route ignores an expired or forged token', async () => {
  const { ctx, request } = context('bad');
  assert.equal(await guardFor(true).canActivate(ctx), true);
  assert.equal(request.user, undefined);
});

test('a public route ignores a revoked session', async () => {
  const { ctx, request } = context('stale');
  assert.equal(await guardFor(true).canActivate(ctx), true);
  assert.equal(request.user, undefined);
});

test('a reset token never acts as an access token, even on a public route', async () => {
  const { ctx, request } = context('reset');
  assert.equal(await guardFor(true).canActivate(ctx), true);
  assert.equal(request.user, undefined);
});

test('a protected route refuses a missing token', async () => {
  await assert.rejects(
    () => guardFor(false).canActivate(context().ctx),
    (e) => status(e) === 401,
  );
});

test('a protected route refuses a legacy token with no session id', async () => {
  await assert.rejects(
    () => guardFor(false).canActivate(context('legacy').ctx),
    (e) => status(e) === 401,
  );
});

test('a protected route refuses a revoked session', async () => {
  await assert.rejects(
    () => guardFor(false).canActivate(context('stale').ctx),
    (e) => status(e) === 401,
  );
});

test('a protected route accepts a live session', async () => {
  const { ctx, request } = context('good');
  assert.equal(await guardFor(false).canActivate(ctx), true);
  assert.equal((request.user as { id: string }).id, 'u1');
});
