import { Injectable, Logger } from '@nestjs/common';

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

  /** Payment receipt after a successful subscription. */
  async sendReceipt(to: string, name: string, details: { plan: string; amount: string; method: string }): Promise<{ sent: boolean }> {
    return this.send({
      to,
      subject: 'Your Syncourse receipt',
      text: `Hi ${name},\n\nThanks for subscribing to ${details.plan} (${details.amount}) via ${details.method}.\n\n— The Syncourse team`,
    });
  }
}
