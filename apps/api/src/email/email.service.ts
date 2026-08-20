import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Brevo (formerly Sendinblue) transactional email — free tier: 300 emails/day.
 *
 * Brevo hands out two different credentials and they are NOT interchangeable:
 *
 *   xkeysib-…   REST API v3 key  -> api.brevo.com, sent with the `api-key` header
 *   xsmtpsib-…  SMTP relay key   -> smtp-relay.brevo.com, used as an SMTP password
 *                                   together with the relay LOGIN (xxxxx@smtp-brevo.com),
 *                                   which is not your account email
 *
 * So both paths are supported and picked in this order:
 *   1. a real xkeysib-… REST key              -> HTTP API (no socket to keep open)
 *   2. BREVO_SMTP_KEY + BREVO_SMTP_USER set   -> SMTP relay via nodemailer
 *   3. neither                                -> sending is skipped and logged
 *
 * Keys are classified by PREFIX, not by which variable they arrived in: pasting
 * an xsmtpsib-… key into BREVO_API_KEY is the easy mistake to make, and it used to
 * mean every send 401'd against the REST API instead of falling through to SMTP.
 *
 * Fails soft everywhere: callers get { sent: false } instead of an exception, and
 * registration falls back to auto-verify so a dead mailbox cannot brick signups.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string;
  private readonly smtpKey: string;
  private readonly smtpHost = process.env.BREVO_SMTP_HOST ?? 'smtp-relay.brevo.com';
  private readonly smtpPort = Number(process.env.BREVO_SMTP_PORT ?? 465);
  private readonly smtpUser = process.env.BREVO_SMTP_USER ?? '';
  private readonly senderEmail = process.env.BREVO_SENDER_EMAIL ?? 'noreply@syncourse.app';
  private readonly senderName = process.env.BREVO_SENDER_NAME ?? 'Syncourse';
  private transporter: Transporter | null = null;

  constructor() {
    const rawApi = (process.env.BREVO_API_KEY ?? '').trim();
    const rawSmtp = (process.env.BREVO_SMTP_KEY ?? '').trim();

    // Sort by prefix so a key in the wrong variable still works.
    this.apiKey = rawApi.startsWith('xkeysib-') ? rawApi : '';
    this.smtpKey = rawSmtp.startsWith('xsmtpsib-')
      ? rawSmtp
      : rawApi.startsWith('xsmtpsib-')
        ? rawApi
        : rawSmtp;

    if (rawApi && !rawApi.startsWith('xkeysib-')) {
      this.logger.warn(
        `BREVO_API_KEY does not look like a REST key (expected xkeysib-…); ` +
          `${rawApi.startsWith('xsmtpsib-') ? 'treating it as an SMTP relay key' : 'ignoring it'}.`,
      );
    }
  }

  private get smtpConfigured(): boolean {
    return this.smtpKey.length > 0 && this.smtpUser.length > 0;
  }

  get enabled(): boolean {
    return this.apiKey.length > 0 || this.smtpConfigured;
  }

  /** Which path a send would take — surfaced by the /admin/email-status probe. */
  get transport(): 'api' | 'smtp' | 'none' {
    if (this.apiKey.length > 0) return 'api';
    if (this.smtpConfigured) return 'smtp';
    return 'none';
  }

  /**
   * Send a transactional email. Returns { sent: boolean } — never throws to the caller.
   */
  async send(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ sent: boolean }> {
    if (this.apiKey.length > 0) return this.sendViaApi(input);
    if (this.smtpConfigured) return this.sendViaSmtp(input);
    this.logger.debug(
      `Email skipped (no BREVO_API_KEY and no BREVO_SMTP_KEY/USER): ${input.subject} -> ${input.to}`,
    );
    return { sent: false };
  }

  /** Brevo REST API v3 (needs an xkeysib-… key). */
  private async sendViaApi(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ sent: boolean }> {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: this.senderEmail, name: this.senderName },
          to: [{ email: input.to }],
          subject: input.subject,
          textContent: input.text,
          ...(input.html ? { htmlContent: input.html } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(`Brevo API send failed (${res.status}): ${body.slice(0, 200)}`);
        return { sent: false };
      }
      return { sent: true };
    } catch (err) {
      this.logger.warn(`Brevo API request error: ${(err as Error).message}`);
      return { sent: false };
    }
  }

  /**
   * Brevo SMTP relay (needs an xsmtpsib-… key + the relay login).
   *
   * The transporter is built once and reused — nodemailer pools the connection,
   * so we are not paying a TLS handshake per verification code.
   */
  private async sendViaSmtp(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ sent: boolean }> {
    try {
      if (!this.transporter) {
        this.transporter = nodemailer.createTransport({
          host: this.smtpHost,
          port: this.smtpPort,
          secure: this.smtpPort === 465, // 465 = implicit TLS, 587 = STARTTLS
          auth: { user: this.smtpUser, pass: this.smtpKey },
          pool: true,
          maxConnections: 2,
        });
      }
      await this.transporter.sendMail({
        from: `"${this.senderName}" <${this.senderEmail}>`,
        replyTo: this.senderEmail,
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      });
      return { sent: true };
    } catch (err) {
      // Most common failure here is an unverified sender: Brevo rejects a "from"
      // address that is not a verified sender/domain on the account.
      this.logger.warn(`Brevo SMTP send failed (from ${this.senderEmail}): ${(err as Error).message}`);
      return { sent: false };
    }
  }

  /** Prove the SMTP credentials authenticate without sending anything. */
  async verifyTransport(): Promise<{ ok: boolean; detail: string }> {
    if (this.transport !== 'smtp') {
      return { ok: this.transport === 'api', detail: `transport=${this.transport}` };
    }
    try {
      if (!this.transporter) {
        this.transporter = nodemailer.createTransport({
          host: this.smtpHost,
          port: this.smtpPort,
          secure: this.smtpPort === 465,
          auth: { user: this.smtpUser, pass: this.smtpKey },
        });
      }
      await this.transporter.verify();
      return { ok: true, detail: `${this.smtpHost}:${this.smtpPort} as ${this.smtpUser}` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  /** Welcome + verification email after registration. */
  async sendWelcome(to: string, name: string): Promise<{ sent: boolean }> {
    return this.send({
      to,
      subject: `Welcome to Syncourse, ${name} 🎓`,
      text: `Hi ${name},\n\nWelcome to Syncourse! Your account is ready. Browse the catalog and start learning today.\n\n— The Syncourse team`,
    });
  }

  /**
   * Registration verification code.
   *
   * Sent as multipart text + HTML on purpose: HTML-only mail is itself a spam
   * signal, and these codes are worthless if they land in spam.
   *
   * Deliverability note: BREVO_SENDER_EMAIL must be a sender/domain verified in
   * Brevo. A gmail.com "from" relayed through Brevo fails SPF/DKIM and Gmail
   * will filter it, so use an address on a domain you control.
   */
  async sendVerificationCode(to: string, name: string, code: string): Promise<{ sent: boolean }> {
    const text =
      `Hi ${name},\n\n` +
      `Your Syncourse verification code is: ${code}\n\n` +
      `Enter it in the app to finish creating your account. It expires in 15 minutes.\n\n` +
      `If you didn't sign up, you can ignore this email.\n\n— The Syncourse team`;
    const html =
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px">` +
      `<h2 style="margin:0 0 4px">Verify your email</h2>` +
      `<p style="color:#555;margin:0 0 18px">Hi ${escapeHtml(name)}, use the code below to finish creating your Syncourse account.</p>` +
      `<div style="border:1px dashed #d0d0d0;border-radius:10px;padding:18px;text-align:center">` +
      `<div style="font-size:11px;letter-spacing:2px;color:#777;text-transform:uppercase">Verification code</div>` +
      `<div style="font-size:34px;font-weight:800;letter-spacing:10px;margin-top:6px">${code}</div>` +
      `</div>` +
      `<p style="color:#555;margin:18px 0 0">This code expires in 15 minutes.</p>` +
      `<p style="color:#888;font-size:12px;margin-top:16px">If you didn't sign up, you can ignore this email.</p>` +
      `<p style="color:#888;font-size:12px">Syncourse — complete courses, delivered.</p>` +
      `</div>`;
    return this.send({ to, subject: `Your Syncourse code: ${code}`, text, html });
  }

  /**
   * Password-reset code.
   *
   * A code rather than a magic link on purpose: links get mangled by mail
   * clients, are awkward to tap on a phone, and are far more likely to be
   * flagged than six plain digits.
   */
  async sendResetCode(to: string, name: string, code: string): Promise<{ sent: boolean }> {
    const text =
      `Hi ${name},\n\n` +
      `Your Syncourse password reset code is: ${code}\n\n` +
      `Enter it in the app to choose a new password. It expires in 15 minutes.\n\n` +
      `If you didn't ask to reset your password, ignore this email — your ` +
      `current password still works.\n\n— The Syncourse team`;
    const html =
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px">` +
      `<h2 style="margin:0 0 4px">Reset your password</h2>` +
      `<p style="color:#555;margin:0 0 18px">Hi ${escapeHtml(name)}, enter the code below to choose a new password.</p>` +
      `<div style="border:1px dashed #d0d0d0;border-radius:10px;padding:18px;text-align:center">` +
      `<div style="font-size:11px;letter-spacing:2px;color:#777;text-transform:uppercase">Reset code</div>` +
      `<div style="font-size:34px;font-weight:800;letter-spacing:10px;margin-top:6px">${code}</div>` +
      `</div>` +
      `<p style="color:#555;margin:18px 0 0">This code expires in 15 minutes.</p>` +
      `<p style="color:#888;font-size:12px;margin-top:16px">If you didn't ask to reset your password, ignore this email — your current password still works.</p>` +
      `<p style="color:#888;font-size:12px">Syncourse — complete courses, delivered.</p>` +
      `</div>`;
    return this.send({ to, subject: `Your Syncourse reset code: ${code}`, text, html });
  }

  /** Payment receipt after a successful subscription. */
  async sendReceipt(to: string, name: string, details: { plan: string; amount: string; method: string }): Promise<{ sent: boolean }> {
    return this.send({
      to,
      subject: 'Your Syncourse receipt',
      text: `Hi ${name},\n\nThanks for subscribing to ${details.plan} (${details.amount}) via ${details.method}.\n\n— The Syncourse team`,
    });
  }
}
