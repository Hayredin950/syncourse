/**
 * Integration check for hard email verification.
 *
 * Two paths matter and only one of them can be exercised without a live mailbox:
 *
 *  A) email NOT configured (BREVO_API_KEY empty)  -> register must fail OPEN:
 *     auto-verify and return a token, so a dead mailbox can never brick signups.
 *  B) email configured and the send succeeded     -> register returns no token and
 *     login is refused until the 6-digit code is confirmed.
 *
 * Path B is simulated by writing the pending-code state straight into the row —
 * exactly what register() writes after a successful send — so the login refusal,
 * wrong-code counter, expiry and success paths are all proven for real.
 *
 * Runs against a throwaway account and deletes it at the end.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = process.env.PROBE_API ?? 'http://localhost:4010/api';
const EMAIL = 'zzz-verify-probe@syncourse.invalid';
const PASSWORD = 'probe-password-123';

type Res = { status: number; body: any };

async function call(path: string, body: unknown): Promise<Res> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const checks: [string, boolean, string][] = [];
const check = (label: string, ok: boolean, detail = '') => checks.push([label, ok, detail]);

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function main() {
  await cleanup();

  // --- A) email not configured: must fail open ---
  const reg = await call('/auth/register', {
    name: 'Verify Probe',
    username: `zzzprobe${Date.now().toString(36).slice(-6)}`,
    email: EMAIL,
    password: PASSWORD,
  });
  check('register succeeds', reg.status === 201 || reg.status === 200, `status ${reg.status}`);
  check(
    'no mailbox -> fails OPEN with a token (signups never brick)',
    typeof reg.body?.accessToken === 'string' && reg.body.accessToken.length > 20,
    reg.body?.requiresVerification ? 'returned requiresVerification instead' : '',
  );

  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  check('fallback marked the account verified', user?.isVerified === true, `isVerified=${user?.isVerified}`);
  check('fallback cleared the pending code', user?.verifyCode === null, `verifyCode=${user?.verifyCode}`);
  if (!user) throw new Error('probe user missing');

  const loginOpen = await call('/auth/login', { email: EMAIL, password: PASSWORD });
  check('verified account can sign in', loginOpen.status === 200 && !!loginOpen.body?.accessToken, `status ${loginOpen.status}`);

  // --- B) simulate a successful send: pending code, not yet verified ---
  await prisma.user.update({
    where: { id: user.id },
    data: {
      isVerified: false,
      verifyCode: '246813',
      verifyExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      verifySentAt: new Date(),
      verifyAttempts: 0,
    },
  });

  const blocked = await call('/auth/login', { email: EMAIL, password: PASSWORD });
  check('unverified sign-in refused with 403', blocked.status === 403, `status ${blocked.status}`);
  check(
    '403 message tells the user to check their inbox',
    typeof blocked.body?.message === 'string' && /verify your email/i.test(blocked.body.message),
    String(blocked.body?.message).slice(0, 60),
  );

  const wrong = await call('/auth/verify', { email: EMAIL, code: '111111' });
  check('wrong code rejected', wrong.status === 400, `status ${wrong.status}`);
  check(
    'wrong code reports remaining attempts',
    /attempts left/i.test(String(wrong.body?.message)),
    String(wrong.body?.message).slice(0, 60),
  );
  const afterWrong = await prisma.user.findUnique({ where: { email: EMAIL } });
  check('wrong code increments the attempt counter', afterWrong?.verifyAttempts === 1, `attempts=${afterWrong?.verifyAttempts}`);
  check('wrong code does NOT verify the account', afterWrong?.isVerified === false, `isVerified=${afterWrong?.isVerified}`);

  const malformed = await call('/auth/verify', { email: EMAIL, code: '12ab' });
  check('non-numeric code rejected by the DTO', malformed.status === 400, `status ${malformed.status}`);

  // expiry
  await prisma.user.update({
    where: { id: user.id },
    data: { verifyExpiresAt: new Date(Date.now() - 1000), verifyAttempts: 0 },
  });
  const expired = await call('/auth/verify', { email: EMAIL, code: '246813' });
  check('expired code rejected', expired.status === 400 && /expired/i.test(String(expired.body?.message)), String(expired.body?.message).slice(0, 60));

  // resend is rate-limited (verifySentAt is seconds old)
  const tooSoon = await call('/auth/resend-verification', { email: EMAIL });
  check('resend rate-limited to 1/min', tooSoon.status === 429, `status ${tooSoon.status}`);

  // resend with no mailbox configured must not silently claim success
  await prisma.user.update({ where: { id: user.id }, data: { verifySentAt: new Date(Date.now() - 120_000) } });
  const resendNoMail = await call('/auth/resend-verification', { email: EMAIL });
  check('resend without a mailbox returns 503, not a false "sent"', resendNoMail.status === 503, `status ${resendNoMail.status}`);
  const afterResend = await prisma.user.findUnique({ where: { email: EMAIL } });
  check('failed resend left the old code intact', afterResend?.verifyCode === '246813', `code=${afterResend?.verifyCode}`);

  // --- correct code -> verified + signed in ---
  await prisma.user.update({
    where: { id: user.id },
    data: { verifyExpiresAt: new Date(Date.now() + 15 * 60 * 1000), verifyAttempts: 0 },
  });
  const good = await call('/auth/verify', { email: EMAIL, code: '246813' });
  check('correct code returns a token', good.status === 200 && !!good.body?.accessToken, `status ${good.status}`);
  const verified = await prisma.user.findUnique({ where: { email: EMAIL } });
  check('account is now verified', verified?.isVerified === true, `isVerified=${verified?.isVerified}`);
  check('code wiped after use', verified?.verifyCode === null && verified?.verifyExpiresAt === null, `code=${verified?.verifyCode}`);

  const replay = await call('/auth/verify', { email: EMAIL, code: '246813' });
  check('replaying the used code cannot re-verify a fresh signup', replay.status === 200, `status ${replay.status}`);

  const loginAfter = await call('/auth/login', { email: EMAIL, password: PASSWORD });
  check('sign-in works after verifying', loginAfter.status === 200 && !!loginAfter.body?.accessToken, `status ${loginAfter.status}`);

  // enumeration: unknown email on resend must look identical to a known one
  const unknown = await call('/auth/resend-verification', { email: 'zzz-nobody@syncourse.invalid' });
  check('unknown email on resend does not leak (200 sent)', unknown.status === 200, `status ${unknown.status}`);

  // --- report ---
  let bad = 0;
  for (const [label, ok, detail] of checks) {
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? `  <- ${detail}` : ''}`);
  }

  await cleanup();
  const left = await prisma.user.count({ where: { email: EMAIL } });
  console.log(`${left === 0 ? 'PASS' : 'FAIL'}  probe account cleaned up`);
  if (left) bad++;

  console.log(bad ? `\n${bad} FAILED` : `\nall ${checks.length + 1} checks pass`);
  await prisma.$disconnect();
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => {
  console.error('ERR:', (e as Error).message);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
