/**
 * Integration check for hard email verification.
 *
 * Adapts to how email is configured, because both configurations must be correct
 * and they behave differently:
 *
 *  mailbox OFF (no BREVO_API_KEY, no BREVO_SMTP_KEY) -> register must fail OPEN:
 *    auto-verify and issue a token, so a dead mailbox can never brick signups.
 *  mailbox ON                                        -> register withholds the
 *    token and login is refused until the 6-digit code is confirmed.
 *
 * Which one is in force is detected from the first register response rather than
 * passed in, so the script cannot be run against the wrong assumption.
 *
 * Everything up to section C uses an address on a fake TLD, so nothing is ever
 * delivered — and nothing is ever *sent* there either: when a mailbox IS
 * configured the resend calls that would bounce off that domain are skipped
 * (bounces damage the sending account's reputation). Set LIVE_TO to a real
 * mailbox to exercise the delivering path.
 *
 * Runs against throwaway accounts and deletes them at the end.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = process.env.PROBE_API ?? 'http://localhost:4010/api';
const EMAIL = 'zzz-verify-probe@syncourse.invalid'; // .invalid is reserved: never routable
const PASSWORD = 'probe-password-123';
const PENDING_CODE = '246813';

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
const skipped: string[] = [];

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function main() {
  await cleanup();

  // --- A) register, and let the response tell us which mode we are in ---
  const reg = await call('/auth/register', {
    name: 'Verify Probe',
    username: `zzzprobe${Date.now().toString(36).slice(-6)}`,
    email: EMAIL,
    password: PASSWORD,
  });
  check('register succeeds', reg.status === 201 || reg.status === 200, `status ${reg.status}`);

  const mailbox = reg.body?.requiresVerification === true;
  console.log(`mailbox ${mailbox ? 'ON — register withholds the token' : 'OFF — register must fail open'}\n`);

  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error('probe user missing after register');

  if (mailbox) {
    check('mailbox on -> no token issued at register', !reg.body?.accessToken, 'a token was returned');
    check('mailbox on -> account starts unverified', user.isVerified === false, `isVerified=${user.isVerified}`);
    check('mailbox on -> a 6-digit code was stored', /^\d{6}$/.test(user.verifyCode ?? ''), `code=${user.verifyCode}`);
    check('mailbox on -> code has an expiry', !!user.verifyExpiresAt, 'verifyExpiresAt is null');
  } else {
    check(
      'no mailbox -> fails OPEN with a token (signups never brick)',
      typeof reg.body?.accessToken === 'string' && reg.body.accessToken.length > 20,
      `body ${JSON.stringify(reg.body).slice(0, 100)}`,
    );
    check('fallback marked the account verified', user.isVerified === true, `isVerified=${user.isVerified}`);
    check('fallback cleared the pending code', user.verifyCode === null, `verifyCode=${user.verifyCode}`);
    const loginOpen = await call('/auth/login', { email: EMAIL, password: PASSWORD });
    check('verified account can sign in', loginOpen.status === 200 && !!loginOpen.body?.accessToken, `status ${loginOpen.status}`);
  }

  // --- B) the code-checking rules, from a known pending state ---
  // Written directly so the assertions do not depend on which mode produced it.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      isVerified: false,
      verifyCode: PENDING_CODE,
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
  check('wrong code reports remaining attempts', /attempts left/i.test(String(wrong.body?.message)), String(wrong.body?.message).slice(0, 60));
  const afterWrong = await prisma.user.findUnique({ where: { email: EMAIL } });
  check('wrong code increments the attempt counter', afterWrong?.verifyAttempts === 1, `attempts=${afterWrong?.verifyAttempts}`);
  check('wrong code does NOT verify the account', afterWrong?.isVerified === false, `isVerified=${afterWrong?.isVerified}`);

  const malformed = await call('/auth/verify', { email: EMAIL, code: '12ab' });
  check('non-numeric code rejected by the DTO', malformed.status === 400, `status ${malformed.status}`);

  // lockout after MAX_VERIFY_ATTEMPTS wrong guesses
  await prisma.user.update({ where: { id: user.id }, data: { verifyAttempts: 4 } });
  const lastGuess = await call('/auth/verify', { email: EMAIL, code: '111111' });
  const lockedRow = await prisma.user.findUnique({ where: { email: EMAIL } });
  check('5th wrong guess burns the code', lastGuess.status === 400 && lockedRow?.verifyCode === null, `code=${lockedRow?.verifyCode}`);
  const afterLock = await call('/auth/verify', { email: EMAIL, code: PENDING_CODE });
  check('the correct code no longer works once burned', afterLock.status === 400, `status ${afterLock.status}`);

  // expiry
  await prisma.user.update({
    where: { id: user.id },
    data: { verifyCode: PENDING_CODE, verifyExpiresAt: new Date(Date.now() - 1000), verifyAttempts: 0 },
  });
  const expired = await call('/auth/verify', { email: EMAIL, code: PENDING_CODE });
  check('expired code rejected', expired.status === 400 && /expired/i.test(String(expired.body?.message)), String(expired.body?.message).slice(0, 60));

  // resend: the rate limit is enforced before any send, so it is always safe to assert
  await prisma.user.update({ where: { id: user.id }, data: { verifySentAt: new Date() } });
  const tooSoon = await call('/auth/resend-verification', { email: EMAIL });
  check('resend rate-limited to 1/min', tooSoon.status === 429, `status ${tooSoon.status}`);

  // resend past the rate limit WOULD send — only safe against a fake domain when
  // no mailbox is configured, otherwise it hard-bounces on the sending account.
  if (!mailbox) {
    await prisma.user.update({ where: { id: user.id }, data: { verifySentAt: new Date(Date.now() - 120_000) } });
    const resendNoMail = await call('/auth/resend-verification', { email: EMAIL });
    check('resend without a mailbox returns 503, not a false "sent"', resendNoMail.status === 503, `status ${resendNoMail.status}`);
    const afterResend = await prisma.user.findUnique({ where: { email: EMAIL } });
    check('failed resend left the old code intact', afterResend?.verifyCode === PENDING_CODE, `code=${afterResend?.verifyCode}`);
  } else {
    skipped.push('resend-past-rate-limit (would bounce off the .invalid domain)');
  }

  // --- correct code -> verified + signed in ---
  await prisma.user.update({
    where: { id: user.id },
    data: { verifyCode: PENDING_CODE, verifyExpiresAt: new Date(Date.now() + 15 * 60 * 1000), verifyAttempts: 0 },
  });
  const good = await call('/auth/verify', { email: EMAIL, code: PENDING_CODE });
  check('correct code returns a token', good.status === 200 && !!good.body?.accessToken, `status ${good.status}`);
  const verified = await prisma.user.findUnique({ where: { email: EMAIL } });
  check('account is now verified', verified?.isVerified === true, `isVerified=${verified?.isVerified}`);
  check('code wiped after use', verified?.verifyCode === null && verified?.verifyExpiresAt === null, `code=${verified?.verifyCode}`);

  const replay = await call('/auth/verify', { email: EMAIL, code: PENDING_CODE });
  check('replaying a used code just signs the verified user in', replay.status === 200, `status ${replay.status}`);

  const loginAfter = await call('/auth/login', { email: EMAIL, password: PASSWORD });
  check('sign-in works after verifying', loginAfter.status === 200 && !!loginAfter.body?.accessToken, `status ${loginAfter.status}`);

  const unknown = await call('/auth/resend-verification', { email: 'zzz-nobody@syncourse.invalid' });
  check('unknown email on resend does not leak (200 sent)', unknown.status === 200, `status ${unknown.status}`);

  // --- C) optional: the delivering path, against a real mailbox ---
  //
  // LIVE_TO must be DELIVERABLE — this really sends. Gmail "+tag" addressing is
  // ideal: same inbox, distinct address, so it cannot collide with a real account.
  const LIVE_TO = process.env.LIVE_TO;
  if (LIVE_TO) {
    console.log(`--- live send to ${LIVE_TO} ---`);
    await prisma.user.deleteMany({ where: { email: LIVE_TO.toLowerCase() } });
    const liveReg = await call('/auth/register', {
      name: 'Live Verify Probe',
      username: `zzzlive${Date.now().toString(36).slice(-6)}`,
      email: LIVE_TO,
      password: PASSWORD,
    });
    check(
      'live register withholds the token (mail really went out)',
      liveReg.body?.requiresVerification === true && !liveReg.body?.accessToken,
      `body ${JSON.stringify(liveReg.body).slice(0, 120)}`,
    );
    const liveUser = await prisma.user.findUnique({ where: { email: LIVE_TO.toLowerCase() } });
    check('live signup is unverified', liveUser?.isVerified === false, `isVerified=${liveUser?.isVerified}`);
    check('a 6-digit code was stored', /^\d{6}$/.test(liveUser?.verifyCode ?? ''), `code=${liveUser?.verifyCode}`);

    const liveBlocked = await call('/auth/login', { email: LIVE_TO, password: PASSWORD });
    check('live unverified sign-in refused', liveBlocked.status === 403, `status ${liveBlocked.status}`);

    // resend to a real mailbox is safe; past the rate limit it must rotate the code
    await prisma.user.update({
      where: { id: liveUser!.id },
      data: { verifySentAt: new Date(Date.now() - 120_000) },
    });
    const liveResend = await call('/auth/resend-verification', { email: LIVE_TO });
    const rotated = await prisma.user.findUnique({ where: { email: LIVE_TO.toLowerCase() } });
    check('resend reports sent', liveResend.status === 200 && liveResend.body?.sent === true, `status ${liveResend.status}`);
    check('resend issued a NEW code', /^\d{6}$/.test(rotated?.verifyCode ?? '') && rotated?.verifyCode !== liveUser?.verifyCode, `old=${liveUser?.verifyCode} new=${rotated?.verifyCode}`);
    check('resend reset the attempt counter', rotated?.verifyAttempts === 0, `attempts=${rotated?.verifyAttempts}`);

    const liveGood = await call('/auth/verify', { email: LIVE_TO, code: rotated?.verifyCode ?? '' });
    check('the emailed code verifies the account', liveGood.status === 200 && !!liveGood.body?.accessToken, `status ${liveGood.status}`);

    console.log(`(2 emails sent, codes ${liveUser?.verifyCode} then ${rotated?.verifyCode} — confirm they landed in the INBOX, not spam)\n`);
    await prisma.user.deleteMany({ where: { email: LIVE_TO.toLowerCase() } });
  } else {
    skipped.push('live delivery (set LIVE_TO=you+tag@gmail.com)');
  }

  // --- report ---
  let bad = 0;
  for (const [label, ok, detail] of checks) {
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? `  <- ${detail}` : ''}`);
  }

  await cleanup();
  const left = await prisma.user.count({ where: { email: EMAIL } });
  console.log(`${left === 0 ? 'PASS' : 'FAIL'}  probe accounts cleaned up`);
  if (left) bad++;

  for (const s of skipped) console.log(`SKIP  ${s}`);
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
