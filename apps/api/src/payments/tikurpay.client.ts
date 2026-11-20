import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The Tikur Pay gateway, as far as this app needs it.
 *
 * Tikur Pay verifies Ethiopian bank and wallet transfers against the bank
 * ledger and does not hold the money: the customer transfers to the merchant's
 * own account, and the gateway only confirms that it happened. That is why the
 * secret key is server-side only and why the receiving account details never
 * come from the client — both arrive from the configured seller account.
 *
 * Everything here is a thin, typed wrapper around `fetch`. The decision to
 * grant Premium lives in PaymentsService, never in this file: a provider
 * response is evidence, not an entitlement.
 */

export interface TikurPaymentMethod {
  accountNumber?: string;
  accountName?: string;
  phoneNumber?: string;
}

export interface TikurCheckoutSession {
  success: boolean;
  checkout_url: string;
  direct_checkout_url?: string;
  payment_number: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  expires_at: string;
  expires_in_minutes?: number;
  payment_methods?: Record<string, TikurPaymentMethod>;
}

export interface TikurVerification {
  success: boolean;
  status: string;
  message?: string;
  payment_number?: string;
  amount?: number;
  currency?: string;
  verified_at?: string;
  bank?: string;
  bankName?: string;
  bankCode?: string;
  payerName?: string;
  verificationId?: string;
  receiverAccount?: string;
  receiverName?: string;
  sourceUrl?: string;
}

/**
 * The merchant-level receipt lookup (`POST /api/verify`).
 *
 * It is the only way to confirm a manual transfer: there is no checkout session
 * to attach it to, so the gateway checks the bank ledger (and locks the receipt
 * against reuse) and charges one verification credit.
 */
export interface TikurReferenceVerification {
  success?: boolean;
  verified?: boolean;
  status?: string;
  message?: string;
  amount?: number;
  currency?: string;
  bank?: string;
  bankCode?: string;
  reference?: string;
  senderName?: string;
  senderAccount?: string;
  receiverName?: string;
  receiverAccount?: string;
  verificationId?: string;
  sourceUrl?: string;
}

export interface TikurStatus {
  success?: boolean;
  status: string;
  payment_number?: string;
  amount?: number;
  currency?: string;
  payer?: string;
  bank?: string;
  verification_id?: string;
  verified_at?: string;
  message?: string;
}

export interface TikurAccount {
  success: boolean;
  account?: {
    businessName?: string;
    settings?: { checkoutTimeoutMinutes?: number; webhookConfigured?: boolean };
    paymentMethods?: Record<string, TikurPaymentMethod & { enabled?: boolean }>;
  };
}

const DEFAULT_BASE = 'https://tikurpays.et';
const TIMEOUT_MS = 20_000;

@Injectable()
export class TikurPayClient {
  private readonly logger = new Logger(TikurPayClient.name);

  /** True when the server holds a gateway key. The UI hides the rail otherwise. */
  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  get baseUrl(): string {
    return (process.env.TIKURPAY_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  }

  private get apiKey(): string {
    return (process.env.TIKURPAY_API_KEY || '').trim();
  }

  private get webhookSecret(): string {
    return (process.env.TIKURPAY_WEBHOOK_SECRET || '').trim();
  }

  /** The receiving rails the checkout page will show, for the in-app panel. */
  get rails(): Record<string, TikurPaymentMethod> {
    const rails: Record<string, TikurPaymentMethod> = {};
    const business = (process.env.TIKURPAY_BUSINESS_NAME || 'Syncourse').trim();
    const cbeNumber = (process.env.TIKURPAY_CBE_ACCOUNT || '').trim();
    if (cbeNumber) {
      rails.cbe = {
        accountNumber: cbeNumber,
        accountName: (process.env.TIKURPAY_CBE_NAME || business).trim(),
      };
    }
    // Wallets are part of the same merchant account, so they belong in the
    // fallback panel too: a customer who never opens the hosted page still
    // needs a number that matches the rail they actually use.
    const telebirrPhone = (process.env.TIKURPAY_TELEBIRR_PHONE || '').trim();
    if (telebirrPhone) {
      rails.telebirr = {
        phoneNumber: telebirrPhone,
        accountName: (process.env.TIKURPAY_TELEBIRR_NAME || business).trim(),
      };
    }
    const mpesaPhone = (process.env.TIKURPAY_MPESA_PHONE || '').trim();
    if (mpesaPhone) {
      rails.mpesa = {
        phoneNumber: mpesaPhone,
        accountName: (process.env.TIKURPAY_MPESA_NAME || business).trim(),
      };
    }
    const ebirrPhone = (process.env.TIKURPAY_EBIRR_PHONE || '').trim();
    if (ebirrPhone) {
      rails.ebirr = {
        phoneNumber: ebirrPhone,
        accountName: (process.env.TIKURPAY_EBIRR_NAME || business).trim(),
      };
    }
    return rails;
  }

  /** Create a single-use session bound to this order's exact amount. */
  async createCheckout(input: {
    amount: number;
    currency?: string;
    description: string;
    expiresInMinutes?: number;
  }): Promise<TikurCheckoutSession> {
    return this.call<TikurCheckoutSession>('/api/checkout/create', {
      method: 'POST',
      body: {
        amount: input.amount,
        currency: input.currency ?? 'ETB',
        description: input.description,
        expiresInMinutes: input.expiresInMinutes ?? this.timeoutMinutes,
      },
    });
  }

  /**
   * Submit the customer's receipt. This endpoint is part of the session and
   * costs no credit: the gateway performs the duplicate lock, ledger lookup,
   * amount check and recipient match, and purges the hosted page on success.
   */
  async verifyReceipt(input: {
    paymentNumber: string;
    transactionLink: string;
    bank?: string;
  }): Promise<TikurVerification> {
    return this.call<TikurVerification>('/api/checkout/verify', {
      method: 'POST',
      body: {
        paymentNumber: input.paymentNumber,
        transactionLink: input.transactionLink,
        ...(input.bank ? { bank: input.bank } : {}),
      },
      auth: false,
    });
  }

  /**
   * Verify a receipt without a checkout session (`POST /api/verify`).
   *
   * This is the merchant-level lookup used for manual transfers, where the
   * shopper paid from their own banking app. It costs one credit and locks the
   * receipt against reuse, so callers must run their duplicate checks first.
   */
  async verifyReference(
    reference: string,
    bank?: string,
  ): Promise<TikurReferenceVerification> {
    return this.call<TikurReferenceVerification>('/api/verify', {
      method: 'POST',
      body: {
        reference,
        ...(bank ? { bank } : {}),
      },
    });
  }

  /** Authoritative post-payment state; safe to poll and still answers after purge. */
  async status(paymentNumber: string): Promise<TikurStatus> {
    return this.call<TikurStatus>(`/api/checkout/status/${encodeURIComponent(paymentNumber)}`, {
      method: 'GET',
      auth: false,
    });
  }

  /** Merchant profile — used by the admin console to confirm rails and keys. */
  async account(): Promise<TikurAccount> {
    return this.call<TikurAccount>('/api/account', { method: 'GET' });
  }

  get timeoutMinutes(): number {
    const n = Number(process.env.TIKURPAY_CHECKOUT_TIMEOUT_MINUTES || 15);
    return Number.isFinite(n) && n >= 1 && n <= 1440 ? Math.round(n) : 15;
  }

  /**
   * Verify `x-tikurpay-signature` over the exact received bytes.
   *
   * The signature must be checked before the JSON is trusted: a body that is
   * parsed first and hashed afterwards can be re-serialised differently (key
   * order, spacing), so the HMAC would be computed over bytes the sender never
   * signed. Nest's `rawBody` option is what preserves those bytes.
   *
   * A missing secret fails closed in production; in development it returns
   * false rather than throwing so a local run can still inspect payloads — the
   * caller treats false as unauthorised either way.
   */
  verifyWebhook(raw: Buffer | string | undefined, signature: string | undefined): boolean {
    const secret = this.webhookSecret;
    if (!secret || !raw || !signature) return false;
    const provided = signature.replace(/^sha256=/i, '').trim();
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Normalise a receipt reference so the same proof cannot be claimed twice. */
  static normalizeReference(reference: string): string {
    return reference.trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  }

  private async call<T>(
    path: string,
    opts: { method: 'GET' | 'POST'; body?: unknown; auth?: boolean },
  ): Promise<T> {
    const auth = opts.auth !== false;
    if (auth && !this.apiKey) {
      throw new BadGatewayException('Tikur Pay is not configured on this server');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: opts.method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(auth ? { 'x-api-key': this.apiKey } : {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === 'AbortError' ? 'timed out' : 'was unreachable';
      this.logger.error(`Tikur Pay ${path} ${reason}`);
      throw new BadGatewayException(`The payment gateway ${reason}. Nothing was charged — try again.`);
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // A maintenance page is HTML, not JSON. Say "gateway", not "unexpected
      // token <" — the reader cannot act on a parser error.
      this.logger.error(`Tikur Pay ${path} returned non-JSON (${res.status})`);
      throw new BadGatewayException('The payment gateway is not answering properly. Try again shortly.');
    }

    if (!res.ok) {
      const body = json as { message?: string; error?: string } | null;
      const detail = body?.message || body?.error || `gateway rejected the request (${res.status})`;
      // 400 from /checkout/verify is the normal shape of "this receipt does not
      // prove a payment" — a rejected claim, not an outage. It stays a client
      // error so the app can show the provider's own explanation.
      if (res.status === 400 || res.status === 422) {
        throw new BadRequestException(detail);
      }
      // 5xx is the gateway's own problem (unfunded merchant balance, outage).
      // Its message is written for the account owner, not the customer, so it
      // goes to the log and the shopper gets a sentence they can act on.
      this.logger.error(`Tikur Pay ${path} failed (${res.status}): ${detail}`);
      throw new BadGatewayException(
        'Bank checkout is unavailable right now. Your card and account were not charged — try again shortly or pay by transfer.',
      );
    }

    return json as T;
  }
}
