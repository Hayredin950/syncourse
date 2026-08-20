/**
 * Integration check for the code-based password reset.
 *
 * The flow under test, three steps:
 *   POST /auth/forgot-password  {email}          -> emails a 6-digit code
 *   POST /auth/verify-reset     {email, code}    -> { resetToken }
 *   POST /auth/reset-password   {token, password}-> { reset: true }
 *
 * Nothing is ever sent to an undeliverable address. The probe account is created
 * straight through Prisma (never via /auth/register, which would email a
 * verification code), and step 1 is only exercised through the branches that
 * return before any send: unknown account, password-less account, rate limit.
 * The pending code for steps 2-3 is seeded directly, exactly as verify-check.ts
 * does — the assertions are about the checking rules, not about the mail.
 *
 * Set LIVE_TO=you+tag@gmail.com to additionally exercise the real send.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const BASE = process.env.PROBE_API ?? 'http://localhost:4010/api';
const EMAIL = 'zzz-reset-probe@syncourse.invalid'; // .invalid is reserved: never routable
const NOPASS_EMAIL = 'zzz-reset-google@syncourse.invalid';
const OLD_PASSWORD = 'probe-old-password-1';
const NEW_PASSWORD = 'probe-new-password-2';
const CODE = '135791';

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
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, NOPASS_EMAIL] } } });
}

/** Put the account into a known "code pending" state without sending anything. */
async function seedCode(userId: string, over: Record<string, unknown> = {}) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      resetCode: CODE,
      resetExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      resetSentAt: new Date(),
      resetAttempts: 0,
      ...over,
    },
  });
}

async function main() {
  await cleanup();

  const user = await prisma.user.create({
    data: {
      name: 'Reset Probe',
      username: `zzzreset${Date.now().toString(36).slice(-6)}`,
      email: EMAIL,
      passwordHash: await bcrypt.hash(OLD_PASSWORD, 10),
      isVerified: true, // so sign-in is testable; verification is verify-check.ts's job
    },
  });

  // --- A) step 1, only the branches that send nothing ---
  const unknown = await call('/auth/forgot-password', { email: 'zzz-nobody@syncourse.invalid' });
  check('unknown email answers 200 (no enumeration)', unknown.status === 200, `status ${unknown.status}`);
  check(
    'unknown email reports sent:false, not a false success',
    unknown.body?.sent === false,
    `sent=${unknown.body?.sent}`,
  );

  const noPass = await prisma.user.create({
    data: {
      name: 'Google Only',
      username: `zzzgoog${Date.now().toString(36).slice(-6)}`,
      email: NOPASS_EMAIL,
      isVerified: true,
    },
  });
  const noPassRes = await call('/auth/forgot-password', { email: NOPASS_EMAIL });
  check('password-less (Google/Telegram) account is not resettable', noPassRes.body?.sent === false, `sent=${noPassRes.body?.sent}`);
  const noPassRow = await prisma.user.findUnique({ where: { id: noPass.id } });
  check('...and no code is stored for it', noPassRow?.resetCode === null, `code=${noPassRow?.resetCode}`);
  check(
    'both answers carry the identical message',
    typeof unknown.body?.message === 'string' && unknown.body.message === noPassRes.body?.message,
    `"${unknown.body?.message}" vs "${noPassRes.body?.message}"`,
  );

  // The rate limit is enforced before the send, so asserting it costs no mail.
  await seedCode(user.id, { resetSentAt: new Date() });
  const tooSoon = await call('/auth/forgot-password', { email: EMAIL });
  check('forgot-password rate-limited to 1/min', tooSoon.status === 429, `status ${tooSoon.status}`);
  const stillThere = await prisma.user.findUnique({ where: { id: user.id } });
  check('rate-limited request left the pending code alone', stillThere?.resetCode === CODE, `code=${stillThere?.resetCode}`);

  const badEmail = await call('/auth/forgot-password', { email: 'not-an-email' });
  check('malformed email rejected by the DTO', badEmail.status === 400, `status ${badEmail.status}`);

  // --- B) step 2: the code-checking rules ---
  const wrong = await call('/auth/verify-reset', { email: EMAIL, code: '111111' });
  check('wrong reset code rejected', wrong.status === 400, `status ${wrong.status}`);
  check('wrong code reports remaining attempts', /attempts left/i.test(String(wrong.body?.message)), String(wrong.body?.message).slice(0, 60));
  const afterWrong = await prisma.user.findUnique({ where: { id: user.id } });
  check('wrong code increments the attempt counter', afterWrong?.resetAttempts === 1, `attempts=${afterWrong?.resetAttempts}`);
  check('wrong code issues no token', !wrong.body?.resetToken, 'a token was returned');

  const malformed = await call('/auth/verify-reset', { email: EMAIL, code: '12ab' });
  check('non-numeric reset code rejected by the DTO', malformed.status === 400, `status ${malformed.status}`);

  await prisma.user.update({ where: { id: user.id }, data: { resetAttempts: 4 } });
  const lastGuess = await call('/auth/verify-reset', { email: EMAIL, code: '111111' });
  const burned = await prisma.user.findUnique({ where: { id: user.id } });
  check('5th wrong guess burns the reset code', lastGuess.status === 400 && burned?.resetCode === null, `code=${burned?.resetCode}`);
  const afterBurn = await call('/auth/verify-reset', { email: EMAIL, code: CODE });
  check('the correct code no longer works once burned', afterBurn.status === 400, `status ${afterBurn.status}`);

  await seedCode(user.id, { resetExpiresAt: new Date(Date.now() - 1000) });
  const expired = await call('/auth/verify-reset', { email: EMAIL, code: CODE });
  check('expired reset code rejected', expired.status === 400 && /expired/i.test(String(expired.body?.message)), String(expired.body?.message).slice(0, 60));

  const noAccount = await call('/auth/verify-reset', { email: 'zzz-nobody@syncourse.invalid', code: CODE });
  check('verify-reset on an unknown account is a flat 400', noAccount.status === 400, `status ${noAccount.status}`);

  // --- C) step 2 success, then step 3 ---
  await seedCode(user.id);
  const good = await call('/auth/verify-reset', { email: EMAIL, code: CODE });
  check('correct code returns a resetToken', good.status === 200 && typeof good.body?.resetToken === 'string', `status ${good.status}`);
  const consumed = await prisma.user.findUnique({ where: { id: user.id } });
  check('code is consumed at step 2', consumed?.resetCode === null && consumed?.resetExpiresAt === null, `code=${consumed?.resetCode}`);

  const token: string = good.body?.resetToken ?? '';
  const decoded = jwt.decode(token) as Record<string, unknown> | null;
  check('token is scoped to purpose=reset', decoded?.purpose === 'reset', `purpose=${decoded?.purpose}`);
  check('token is bound to the current password (single use)', typeof decoded?.pv === 'string', `pv=${decoded?.pv}`);
  check('token does NOT leak the password hash', !JSON.stringify(decoded ?? {}).includes('$2'), 'a bcrypt hash appears in the payload');

  const tooShort = await call('/auth/reset-password', { token, password: 'short' });
  check('short new password rejected', tooShort.status === 400, `status ${tooShort.status}`);

  const garbage = await call('/auth/reset-password', { token: 'not.a.jwt', password: NEW_PASSWORD });
  check('garbage token rejected', garbage.status === 400, `status ${garbage.status}`);

  // A validly signed token for the wrong purpose must not be accepted: this is
  // the check that stops an ordinary access token from resetting a password.
  const secret = process.env.JWT_SECRET ?? '';
  if (secret) {
    const wrongPurpose = jwt.sign({ sub: user.id, purpose: 'access' }, secret, { expiresIn: '5m' });
    const wpRes = await call('/auth/reset-password', { token: wrongPurpose, password: NEW_PASSWORD });
    check('a valid token with the wrong purpose is refused', wpRes.status === 400, `status ${wpRes.status}`);
  } else {
    skipped.push('wrong-purpose token (JWT_SECRET not in env)');
  }

  await prisma.session.create({ data: { userId: user.id, device: 'probe', ip: 'n/a', active: true } });
  const done = await call('/auth/reset-password', { token, password: NEW_PASSWORD });
  check('step 3 sets the new password', done.status === 200 && done.body?.reset === true, `status ${done.status}`);

  const oldLogin = await call('/auth/login', { email: EMAIL, password: OLD_PASSWORD });
  check('the old password no longer works', oldLogin.status === 401, `status ${oldLogin.status}`);
  const newLogin = await call('/auth/login', { email: EMAIL, password: NEW_PASSWORD });
  check('the new password signs in', newLogin.status === 200 && !!newLogin.body?.accessToken, `status ${newLogin.status}`);

  const sessions = await prisma.session.count({ where: { userId: user.id, active: true, device: 'probe' } });
  check('other devices are signed out by the reset', sessions === 0, `${sessions} still active`);

  const replay = await call('/auth/reset-password', { token, password: 'probe-third-password-3' });
  check('the used token cannot be replayed', replay.status === 400, `status ${replay.status}`);
  const stillNew = await call('/auth/login', { email: EMAIL, password: NEW_PASSWORD });
  check('...and the replay did not change the password', stillNew.status === 200, `status ${stillNew.status}`);

  const cleared = await prisma.user.findUnique({ where: { id: user.id } });
  check('reset trail cleared, so a new request is not rate-limited', cleared?.resetSentAt === null, `resetSentAt=${cleared?.resetSentAt}`);

  // --- D) optional: the real send ---
  const LIVE_TO = process.env.LIVE_TO;
  if (LIVE_TO) {
    console.log(`--- live reset mail to ${LIVE_TO} ---`);
    const live = LIVE_TO.toLowerCase();
    await prisma.user.deleteMany({ where: { email: live } });
    const liveUser = await prisma.user.create({
      data: {
        name: 'Live Reset Probe',
        username: `zzzlivers${Date.now().toString(36).slice(-6)}`,
        email: live,
        passwordHash: await bcrypt.hash(OLD_PASSWORD, 10),
        isVerified: true,
      },
    });
    const liveReq = await call('/auth/forgot-password', { email: live });
    check('live forgot-password reports sent', liveReq.status === 200 && liveReq.body?.sent === true, `status ${liveReq.status} body ${JSON.stringify(liveReq.body)}`);
    const liveRow = await prisma.user.findUnique({ where: { id: liveUser.id } });
    check('a 6-digit reset code was stored', /^\d{6}$/.test(liveRow?.resetCode ?? ''), `code=${liveRow?.resetCode}`);

    const liveVerify = await call('/auth/verify-reset', { email: live, code: liveRow?.resetCode ?? '' });
    check('the emailed reset code is accepted', liveVerify.status === 200 && !!liveVerify.body?.resetToken, `status ${liveVerify.status}`);
    const liveDone = await call('/auth/reset-password', { token: liveVerify.body?.resetToken, password: NEW_PASSWORD });
    check('the emailed code completes the reset', liveDone.status === 200, `status ${liveDone.status}`);

    console.log(`(1 email sent, code ${liveRow?.resetCode} — confirm it landed in the INBOX, not spam)\n`);
    await prisma.user.deleteMany({ where: { email: live } });
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
  const left = await prisma.user.count({ where: { email: { in: [EMAIL, NOPASS_EMAIL] } } });
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
