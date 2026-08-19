/**
 * Live probe for the Brevo SMTP relay path.
 *
 * Answers three questions in order, cheapest first:
 *   1. do the relay credentials authenticate at all?      (transporter.verify — sends nothing)
 *   2. will Brevo accept the "from" address we want?       (one real send)
 *   3. what exactly does it say when it refuses?           (the raw SMTP response)
 *
 * Usage — credentials come from the environment, never from a committed file:
 *   BREVO_SMTP_USER=xxxxx@smtp-brevo.com \
 *   BREVO_SMTP_KEY=xsmtpsib-... \
 *   BREVO_SENDER_EMAIL=noreply@example.com \
 *   PROBE_TO=you@gmail.com \
 *   npx tsx prisma/smtp-probe.ts
 */
import * as nodemailer from 'nodemailer';

const HOST = process.env.BREVO_SMTP_HOST ?? 'smtp-relay.brevo.com';
const PORT = Number(process.env.BREVO_SMTP_PORT ?? 465);
const USER = process.env.BREVO_SMTP_USER ?? '';
const KEY = process.env.BREVO_SMTP_KEY ?? '';
const SENDER = process.env.BREVO_SENDER_EMAIL ?? '';
const SENDER_NAME = process.env.BREVO_SENDER_NAME ?? 'Syncourse';
const TO = process.env.PROBE_TO ?? '';

function mask(v: string) {
  return v.length <= 12 ? '(too short)' : `${v.slice(0, 12)}…${v.slice(-4)} (${v.length} chars)`;
}

async function main() {
  console.log(`host    ${HOST}:${PORT} (secure=${PORT === 465})`);
  console.log(`login   ${USER || '(unset)'}`);
  console.log(`key     ${KEY ? mask(KEY) : '(unset)'}`);
  console.log(`kind    ${KEY.startsWith('xsmtpsib-') ? 'SMTP relay key' : KEY.startsWith('xkeysib-') ? 'REST API key — wrong kind for SMTP' : 'unrecognised'}`);
  console.log(`from    ${SENDER || '(unset)'}`);
  console.log(`to      ${TO || '(unset)'}\n`);

  if (!USER || !KEY || !SENDER || !TO) {
    console.error('Set BREVO_SMTP_USER, BREVO_SMTP_KEY, BREVO_SENDER_EMAIL and PROBE_TO.');
    process.exit(2);
  }

  const transporter = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465,
    auth: { user: USER, pass: KEY },
  });

  // 1. auth only — nothing is sent, nothing is billed
  try {
    await transporter.verify();
    console.log('PASS  credentials authenticate against the relay');
  } catch (err) {
    console.log(`FAIL  relay refused the credentials: ${(err as Error).message}`);
    process.exit(1);
  }

  // 2. one real send with the sender we actually want to use
  const code = '000000';
  try {
    const info = await transporter.sendMail({
      from: `"${SENDER_NAME}" <${SENDER}>`,
      replyTo: SENDER,
      to: TO,
      subject: `Syncourse SMTP probe (${SENDER})`,
      text: `This is a delivery probe from the Syncourse API.\n\nIf you can read this, verification codes will reach this inbox.\nSample code: ${code}\n\nSender used: ${SENDER}`,
      html: `<p>This is a delivery probe from the Syncourse API.</p><p>If you can read this, verification codes will reach this inbox.</p><p>Sender used: <b>${SENDER}</b></p>`,
    });
    console.log(`PASS  relay ACCEPTED the message from ${SENDER}`);
    console.log(`      response: ${String(info.response ?? '').trim()}`);
    console.log(`      accepted: ${JSON.stringify(info.accepted)}  rejected: ${JSON.stringify(info.rejected)}`);
    console.log('\nNow check the inbox (and the spam folder — that distinction is the whole point).');
  } catch (err) {
    const e = err as Error & { responseCode?: number; response?: string };
    console.log(`FAIL  relay REFUSED the message from ${SENDER}`);
    console.log(`      code ${e.responseCode ?? '?'}: ${(e.response ?? e.message).trim()}`);
    console.log('\nA refusal here almost always means the "from" address is not a verified');
    console.log('sender on this Brevo account. Verify the address (or a domain you own)');
    console.log('under Brevo > Senders, Domains & Dedicated IPs.');
    process.exit(1);
  }
  transporter.close();
}

main();
