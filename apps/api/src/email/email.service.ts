import { Injectable, Logger } from '@nestjs/common';

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
 * Uses plain fetch (Node 18+) — no SDK dependency required.
 * Fails soft: when BREVO_API_KEY is unset, sending is skipped and logged.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey = process.env.BREVO_API_KEY ?? '';
  private readonly senderEmail = process.env.BREVO_SENDER_EMAIL ?? 'noreply@syncourse.app';
  private readonly senderName = process.env.BREVO_SENDER_NAME ?? 'Syncourse';

  get enabled(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Send a transactional email via Brevo's SMTP API (v3).
   * Returns { sent: boolean } — never throws to the caller.
   */
  async send(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ sent: boolean }> {
    if (!this.enabled) {
      this.logger.debug(`Email skipped (BREVO_API_KEY not set): ${input.subject} -> ${input.to}`);
      return { sent: false };
    }
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
        this.logger.warn(`Brevo send failed (${res.status}): ${body.slice(0, 200)}`);
        return { sent: false };
      }
      return { sent: true };
    } catch (err) {
      this.logger.warn(`Brevo request error: ${(err as Error).message}`);
      return { sent: false };
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

  /** Payment receipt after a successful subscription. */
  async sendReceipt(to: string, name: string, details: { plan: string; amount: string; method: string }): Promise<{ sent: boolean }> {
    return this.send({
      to,
      subject: 'Your Syncourse receipt',
      text: `Hi ${name},\n\nThanks for subscribing to ${details.plan} (${details.amount}) via ${details.method}.\n\n— The Syncourse team`,
    });
  }
}
