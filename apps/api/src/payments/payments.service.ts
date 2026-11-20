import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PLANS, premiumExpiresAt } from './plans';
import { TikurPayClient } from './tikurpay.client';

/**
 * Kept as a re-export so callers that import plans from the service keep
 * working. The definitions and the expiry math live in `plans.ts` so admin
 * approval and this service can never disagree again.
 */
export { PLANS } from './plans';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly tikur: TikurPayClient,
  ) {}

  plans() {
    return PLANS;
  }

  /**
   * Create a pending subscription + return method-specific instructions.
   * - telebirr: manual reference flow (STEP 1 send, STEP 2 submit reference)
   * - crypto/stripe: redirect to the hosted processor page (never handle
   *   payment credentials in-house — pattern from the reference web audit)
   */
  async checkout(userId: string, planId: string, method: string, currency = 'ETB') {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) throw new BadRequestException('Unknown plan');
    const validMethods = ['telebirr', 'crypto', 'stripe', 'patreon'];
    if (!validMethods.includes(method)) throw new BadRequestException('Unknown payment method');

    const amount = currency === 'USD' ? plan.priceUsd : plan.priceEtb;
    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        planName: planId,
        paymentMethod: method,
        amount,
        currency,
        status: 'pending',
      },
    });

    const base = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
    switch (method) {
      case 'telebirr': {
        const accountNumber = (
          process.env.TELEBIRR_ACCOUNT_NUMBER ||
          process.env.TIKURPAY_TELEBIRR_PHONE ||
          ''
        ).trim();
        if (!accountNumber) {
          throw new ServiceUnavailableException(
            'Manual Telebirr is not available right now. Use the verified bank checkout instead.',
          );
        }
        const accountName = (
          process.env.TELEBIRR_ACCOUNT_NAME ||
          process.env.TIKURPAY_TELEBIRR_NAME ||
          'Syncourse'
        ).trim();
        return {
          subscriptionId: subscription.id,
          plan: { ...plan, amount, currency },
          status: 'pending',
          steps: {
            step1: {
              title: 'Send money',
              text: `Send ${amount.toLocaleString()} ${currency} with Telebirr to the account below`,
              accountName,
              accountNumber,
            },
            step2: {
              title: 'Submit your transaction number',
              hint: "It's on your Telebirr receipt, next to 'Transaction Number'",
            },
          },
        };
      }
      case 'crypto':
        // Hosted processor invoice — configure OXAPAY/NOWPAYMENTS URL in env.
        return {
          subscriptionId: subscription.id,
          plan: { ...plan, amount, currency: 'USD' },
          status: 'pending',
          redirectUrl:
            process.env.CRYPTO_CHECKOUT_URL ||
            `${base}/premium?checkout=pending&subscription=${subscription.id}`,
          note: 'Premium activates automatically once the network confirms your payment.',
        };
      case 'stripe':
        return {
          subscriptionId: subscription.id,
          plan: { ...plan, amount, currency: 'USD' },
          status: 'pending',
          redirectUrl:
            process.env.STRIPE_CHECKOUT_URL || `${base}/premium?checkout=pending&subscription=${subscription.id}`,
        };
      default:
        return {
          subscriptionId: subscription.id,
          plan: { ...plan, amount, currency },
          status: 'pending',
          redirectUrl: process.env.PATREON_URL || 'https://patreon.com',
        };
    }
  }

  /** Telebirr manual flow — submit the transaction reference from the SMS. */
  async submitReference(userId: string, subscriptionId: string, reference: string) {
    if (!reference.trim()) throw new BadRequestException('Transaction reference is required');
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || sub.userId !== userId) throw new NotFoundException('Subscription not found');

    await this.prisma.paymentReference.create({
      data: { subscriptionId, reference },
    });
    return {
      submitted: true,
      message:
        'Reference received. Most payments verify automatically within seconds; some are checked by a person.',
      status: sub.status,
    };
  }

  /**
   * Staff verification (manual reference review) — used by the CMS.
   *
   * The caller is authorised here, not in the controller: this endpoint used to
   * have no guard at all, so any signed-in reader could approve their own
   * subscription by id. Only a pending payment may be approved, and only once —
   * a second approval would extend the same payment twice.
   */
  async verifySubscription(actorId: string, subscriptionId: string, approved: boolean) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { isStaff: true },
    });
    if (!actor?.isStaff) throw new ForbiddenException('Staff access required');

    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.status === 'approved') {
      throw new BadRequestException('That payment has already been approved');
    }
    if (approved) {
      const activated = await this.activate(sub.userId, sub);
      if (!activated) throw new BadRequestException('That payment has already been approved');
    } else {
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'rejected' },
      });
    }
    return this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
  }

  /**
   * Webhook handler (Stripe/Chapa/OxaPay callback).
   *
   * Providers are not trusted by URL alone: the shared secret must match, and
   * an already-approved subscription is never activated again. Without the
   * idempotency check a replay of the same callback stacked another plan on
   * every request — free premium forever.
   */
  async webhookActivate(subscriptionId: string, provider: string, secret?: string) {
    this.assertWebhookSecret(secret);

    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.status === 'approved') {
      return { ok: true, provider, duplicate: true };
    }
    if (sub.status !== 'pending') {
      return { ok: true, provider, ignored: true };
    }
    const activated = await this.activate(sub.userId, sub);
    if (!activated) return { ok: true, provider, duplicate: true };
    return { ok: true, provider };
  }

  /**
   * Fail closed in production when no secret is configured. In development a
   * missing secret is allowed so the local redirect flows still work.
   */
  private assertWebhookSecret(secret?: string) {
    const expected = process.env.PAYMENTS_WEBHOOK_SECRET;
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Payment webhook is not configured');
      }
      return;
    }
    const provided = Buffer.from(secret ?? '');
    const wanted = Buffer.from(expected);
    if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  /**
   * What the web app is allowed to know about the gateway.
   *
   * `enabled` is the feature flag: false means no key is configured on the
   * server, so the checkout UI must fall back to the manual rails instead of
   * offering a button that can only fail. The account details returned are the
   * same ones the hosted checkout would display — they are the merchant's
   * receiving account, never a secret.
   */
  tikurConfig() {
    const manualNumber = (
      process.env.TELEBIRR_ACCOUNT_NUMBER ||
      process.env.TIKURPAY_TELEBIRR_PHONE ||
      ''
    ).trim();
    return {
      enabled: this.tikur.configured,
      businessName: (process.env.TIKURPAY_BUSINESS_NAME || 'Syncourse').trim(),
      timeoutMinutes: this.tikur.timeoutMinutes,
      // The manual rail is only offered when a real wallet is on file. It used
      // to fall back to `0000000000`, which is not an account anyone can pay.
      manualTelebirr: {
        enabled: Boolean(manualNumber),
        accountNumber: manualNumber,
        accountName: (
          process.env.TELEBIRR_ACCOUNT_NAME ||
          process.env.TIKURPAY_TELEBIRR_NAME ||
          process.env.TIKURPAY_BUSINESS_NAME ||
          'Syncourse'
        ).trim(),
      },
      rails: this.tikur.rails,
    };
  }

  /**
   * Open a Tikur Pay session for one plan.
   *
   * The amount is decided here, from the plan table, and sent to the gateway —
   * not echoed back from the browser. The session is single-use and bound to
   * this subscription, so the payment number cannot be recycled for a cheaper
   * plan or a different account.
   */
  async tikurCheckout(userId: string, planId: string) {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) throw new BadRequestException('Unknown plan');
    if (!this.tikur.configured) {
      throw new ServiceUnavailableException(
        'Bank checkout is not switched on yet. Use the manual transfer option below.',
      );
    }

    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        planName: plan.id,
        paymentMethod: 'tikurpay',
        amount: plan.priceEtb,
        currency: 'ETB',
        status: 'pending',
      },
    });

    let session;
    try {
      session = await this.tikur.createCheckout({
        amount: plan.priceEtb,
        currency: 'ETB',
        description: `Syncourse ${plan.name} premium · order ${subscription.id.slice(-6).toUpperCase()}`,
        expiresInMinutes: this.tikur.timeoutMinutes,
      });
    } catch (err) {
      // A subscription with no session can never be paid, so it must not sit in
      // the pending queue looking like an abandoned transfer.
      await this.prisma.subscription
        .update({ where: { id: subscription.id }, data: { status: 'rejected', txReference: 'checkout-failed' } })
        .catch(() => undefined);
      throw err;
    }

    if (!session?.success || !session.payment_number || !session.checkout_url) {
      await this.prisma.subscription
        .update({ where: { id: subscription.id }, data: { status: 'rejected', txReference: 'checkout-invalid' } })
        .catch(() => undefined);
      throw new BadGatewayException('The payment gateway did not return a checkout session. Try again.');
    }

    const expiresAt = new Date(session.expires_at);
    const payment = await this.prisma.tikurPayment.create({
      data: {
        subscriptionId: subscription.id,
        paymentNumber: session.payment_number,
        checkoutUrl: session.checkout_url,
        amount: plan.priceEtb,
        currency: session.currency || 'ETB',
        status: 'pending',
        expiresAt: Number.isNaN(expiresAt.getTime()) ? null : expiresAt,
      },
    });

    return {
      subscriptionId: subscription.id,
      plan: { ...plan, amount: plan.priceEtb, currency: 'ETB' },
      status: 'pending',
      paymentNumber: payment.paymentNumber,
      checkoutUrl: payment.checkoutUrl,
      amount: payment.amount,
      currency: payment.currency,
      expiresAt: payment.expiresAt,
      methods: session.payment_methods ?? this.tikur.rails,
    };
  }

  /**
   * Accept a bank receipt for a session and decide on the spot.
   *
   * Four things are checked before Premium moves: the session belongs to this
   * user and is still open, the gateway confirms the transfer against the bank
   * ledger, the confirmed amount equals the plan's price, and the receipt has
   * never been used before. The last one is enforced twice — a cheap lookup
   * first so a reused link does not cost a gateway call, and a unique index at
   * claim time so two simultaneous submissions cannot both win.
   */
  async tikurVerify(
    userId: string,
    subscriptionId: string,
    transactionLink: string,
    bank?: string,
  ) {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || sub.userId !== userId) throw new NotFoundException('Subscription not found');
    if (sub.status === 'approved') {
      return { status: 'completed', duplicate: true, subscriptionId, message: 'Premium is already active.' };
    }
    if (sub.status !== 'pending') throw new BadRequestException('That order is no longer open.');

    const payment = await this.prisma.tikurPayment.findUnique({ where: { subscriptionId } });
    if (!payment) throw new BadRequestException('Start a bank checkout before submitting a receipt.');
    if (payment.status === 'completed') {
      return { status: 'completed', duplicate: true, subscriptionId, message: 'This payment is already settled.' };
    }
    if (payment.expiresAt && payment.expiresAt.getTime() < Date.now()) {
      await this.prisma.tikurPayment.updateMany({
        where: { id: payment.id, status: 'pending' },
        data: { status: 'expired' },
      });
      throw new BadRequestException('That checkout window has closed. Start a new one — nothing was charged.');
    }

    const receipt = transactionLink.trim();
    if (receipt.length < 4) {
      throw new BadRequestException('Paste the bank receipt link or the FT transaction number.');
    }

    const normalRef = TikurPayClient.normalizeReference(receipt);
    const used = await this.prisma.tikurPayment.findFirst({
      where: { reference: normalRef, NOT: { id: payment.id } },
      select: { id: true },
    });
    if (used) {
      throw new BadRequestException(
        'That receipt has already been used to unlock another account. Each transfer can only be claimed once.',
      );
    }

    const result = await this.tikur.verifyReceipt({
      paymentNumber: payment.paymentNumber,
      transactionLink: receipt,
      bank,
    });

    if (!this.tikurSaysPaid(result.status) || result.success !== true) {
      throw new BadRequestException(
        result.message || 'The gateway could not confirm this transfer. Check the receipt and try again.',
      );
    }
    if (result.payment_number && result.payment_number !== payment.paymentNumber) {
      throw new BadRequestException('That receipt belongs to a different checkout.');
    }
    if (typeof result.amount === 'number' && Math.abs(result.amount - payment.amount) > 0.01) {
      throw new BadRequestException(
        `The transfer was ${result.amount.toLocaleString()} ETB but this plan costs ${payment.amount.toLocaleString()} ETB. Nothing was unlocked.`,
      );
    }

    const settled = await this.settleTikur(payment.id, {
      reference: TikurPayClient.normalizeReference(result.verificationId || receipt),
      payerName: result.payerName ?? null,
      bankCode: result.bankCode ?? null,
      verificationId: result.verificationId ?? null,
      raw: result as unknown as Prisma.InputJsonValue,
    });

    return {
      status: 'completed',
      subscriptionId,
      paymentNumber: payment.paymentNumber,
      amount: payment.amount,
      currency: payment.currency,
      duplicate: settled.duplicate,
      payerName: result.payerName ?? null,
      message: settled.duplicate
        ? 'That payment was already applied.'
        : 'Payment verified — Premium is unlocked.',
    };
  }

  /**
   * Reconcile a session with the gateway.
   *
   * This is what makes the flow work when the webhook is late, blocked or
   * simply not configured yet: the gateway keeps authoritative status after it
   * purges the checkout page, and a completed status carries the verification
   * id, so the same claim path can settle the order. Polling never grants twice
   * because settlement is conditional on the row still being pending.
   */
  async tikurStatus(userId: string, paymentNumber: string) {
    const payment = await this.prisma.tikurPayment.findUnique({
      where: { paymentNumber },
      include: { subscription: { select: { userId: true } } },
    });
    if (!payment || payment.subscription.userId !== userId) {
      throw new NotFoundException('Checkout not found');
    }
    if (payment.status === 'completed') {
      return {
        status: 'completed',
        paymentNumber,
        amount: payment.amount,
        currency: payment.currency,
        verifiedAt: payment.verifiedAt,
      };
    }

    const remote = await this.tikur.status(paymentNumber).catch(() => null);
    if (!remote) {
      return { status: payment.status, paymentNumber, amount: payment.amount, currency: payment.currency };
    }

    if (this.tikurSaysPaid(remote.status)) {
      if (typeof remote.amount === 'number' && Math.abs(remote.amount - payment.amount) > 0.01) {
        this.logger.error(
          `Tikur Pay ${paymentNumber}: settled ${remote.amount} but expected ${payment.amount} — not activating`,
        );
        return { status: 'review', paymentNumber, amount: payment.amount, currency: payment.currency };
      }
      const ref = remote.verification_id || payment.paymentNumber;
      await this.settleTikur(payment.id, {
        reference: TikurPayClient.normalizeReference(ref),
        payerName: remote.payer ?? null,
        bankCode: null,
        verificationId: remote.verification_id ?? null,
        raw: remote as unknown as Prisma.InputJsonValue,
      });
      return {
        status: 'completed',
        paymentNumber,
        amount: payment.amount,
        currency: payment.currency,
      };
    }

    if (remote.status === 'expired' && payment.status === 'pending') {
      await this.prisma.tikurPayment.updateMany({
        where: { id: payment.id, status: 'pending' },
        data: { status: 'expired' },
      });
      return { status: 'expired', paymentNumber, amount: payment.amount, currency: payment.currency };
    }

    return { status: payment.status, paymentNumber, amount: payment.amount, currency: payment.currency };
  }

  /**
   * Signed gateway callback.
   *
   * The bytes are verified before anything is read from them, and an unknown
   * payment number is acknowledged without action — a webhook is a hint that
   * something changed, not a command to unlock an account. Even for a known
   * session, settlement still re-checks the amount and the receipt's single use.
   */
  async tikurWebhook(raw: Buffer | string | undefined, signature: string | undefined, body: unknown) {
    if (!this.tikur.verifyWebhook(raw, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const event = this.readTikurEvent(body);
    if (!event.paymentNumber) {
      this.logger.warn(`Tikur webhook without a payment number (event: ${event.status || 'unknown'})`);
      return { received: true };
    }

    const payment = await this.prisma.tikurPayment.findUnique({
      where: { paymentNumber: event.paymentNumber },
    });
    if (!payment) {
      // Could be a test ping, or a key rotated on another deployment. Nothing
      // here is allowed to create an entitlement from an unknown id.
      this.logger.warn(`Tikur webhook for unknown session ${event.paymentNumber}`);
      return { received: true };
    }

    if (this.tikurSaysPaid(event.status)) {
      if (typeof event.amount === 'number' && Math.abs(event.amount - payment.amount) > 0.01) {
        this.logger.error(
          `Tikur webhook ${event.paymentNumber}: amount ${event.amount} does not match ${payment.amount}`,
        );
        return { received: true, ignored: 'amount' };
      }
      await this.settleTikur(payment.id, {
        reference: TikurPayClient.normalizeReference(event.verificationId || payment.paymentNumber),
        payerName: event.payerName,
        bankCode: event.bankCode,
        verificationId: event.verificationId,
        raw: body as Prisma.InputJsonValue,
      });
      return { received: true, status: 'completed' };
    }

    if (event.status === 'expired' || event.status === 'failed') {
      await this.prisma.tikurPayment.updateMany({
        where: { id: payment.id, status: 'pending' },
        data: { status: 'expired' },
      });
      return { received: true, status: 'expired' };
    }

    return { received: true, status: 'ignored' };
  }

  /**
   * Claim a receipt and grant the plan, exactly once.
   *
   * The conditional update is the lock: `status: { not: 'completed' }` means
   * only one concurrent caller can flip the row, and the unique index on
   * `reference` means even a different session cannot reuse the same transfer.
   * Activation runs after the claim commits, so a failed email or a duplicate
   * webhook can never extend the same payment twice.
   */
  private async settleTikur(
    paymentId: string,
    proof: {
      reference: string;
      payerName: string | null;
      bankCode: string | null;
      verificationId: string | null;
      raw: Prisma.InputJsonValue;
    },
  ): Promise<{ duplicate: boolean }> {
    let duplicate = false;
    try {
      duplicate = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.tikurPayment.updateMany({
          where: { id: paymentId, status: { not: 'completed' } },
          data: {
            status: 'completed',
            reference: proof.reference,
            payerName: proof.payerName,
            bankCode: proof.bankCode,
            verificationId: proof.verificationId,
            verifiedAt: new Date(),
            raw: proof.raw,
          },
        });
        if (claim.count === 0) return true;

        const payment = await tx.tikurPayment.findUniqueOrThrow({
          where: { id: paymentId },
          include: { subscription: true },
        });

        // The amount the order was opened for must still be the plan's price.
        // A plan table edit between checkout and settlement should never make
        // a 149 ETB transfer buy a 549 ETB pass.
        const plan = PLANS.find((p) => p.id === payment.subscription.planName);
        if (plan && Math.abs(payment.subscription.amount - plan.priceEtb) > 0.01) {
          throw new BadRequestException('The order amount no longer matches the plan.');
        }

        await tx.paymentReference.create({
          data: {
            subscriptionId: payment.subscriptionId,
            reference: proof.reference,
            verified: true,
          },
        });
        await tx.subscription.update({
          where: { id: payment.subscriptionId },
          data: { txReference: proof.reference },
        });
        return false;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // The unique index caught a second claim of the same receipt.
        throw new BadRequestException(
          'That receipt has already been claimed. Each transfer can only unlock one account.',
        );
      }
      throw err;
    }

    if (duplicate) return { duplicate: true };

    const payment = await this.prisma.tikurPayment.findUnique({
      where: { id: paymentId },
      include: { subscription: { select: { userId: true, planName: true, id: true } } },
    });
    if (!payment) return { duplicate: false };

    const activated = await this.activate(payment.subscription.userId, {
      id: payment.subscription.id,
      planName: payment.subscription.planName,
    });
    if (!activated) return { duplicate: true };
    return { duplicate: false };
  }

  /** Both providers spell success differently; accept the documented aliases. */
  private tikurSaysPaid(status: string | undefined | null): boolean {
    const s = String(status ?? '').toLowerCase();
    return s === 'completed' || s === 'complete' || s === 'paid' || s === 'success' || s === 'yes';
  }

  /** Webhook payloads are nested inconsistently; read the shapes the docs show. */
  private readTikurEvent(body: unknown) {
    const root = (body ?? {}) as Record<string, unknown>;
    const data = (root.data ?? root.payload ?? root) as Record<string, unknown>;
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const v = data[key] ?? root[key];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return undefined;
    };
    const number = pick('payment_number', 'paymentNumber', 'id');
    return {
      paymentNumber: typeof number === 'string' ? number : undefined,
      status: String(pick('status', 'event', 'type') ?? ''),
      amount: typeof pick('amount') === 'number' ? (pick('amount') as number) : undefined,
      payerName: (pick('payerName', 'payer', 'customerName') as string | undefined) ?? null,
      bankCode: (pick('bankCode', 'bank') as string | undefined) ?? null,
      verificationId: (pick('verificationId', 'verification_id', 'reference') as string | undefined) ?? null,
    };
  }

  async mySubscription(userId: string) {
    return this.prisma.subscription.findFirst({
      where: { userId, status: 'approved' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Move a subscription to approved and extend the user's plan.
   *
   * The status claim is a single conditional UPDATE inside the transaction:
   * two webhook retries landing together used to read `pending` at the same
   * time and each add a full plan period. The loser now claims nothing and
   * reports a duplicate instead.
   */
  private async activate(userId: string, sub: { id: string; planName: string }): Promise<boolean> {
    const plan = PLANS.find((p) => p.id === sub.planName);
    const now = new Date();

    const activated = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.subscription.updateMany({
        where: { id: sub.id, status: { not: 'approved' } },
        data: { status: 'approved', periodStart: now },
      });
      if (claim.count === 0) return false;

      const current = await tx.user.findUnique({ where: { id: userId } });
      // stacking: if a pass is running, add to what's left
      const stacked = premiumExpiresAt(current?.planExpiresAt, sub.planName, now);
      await tx.subscription.update({ where: { id: sub.id }, data: { periodEnd: stacked } });
      await tx.user.update({
        where: { id: userId },
        data: { planType: 'premium', planExpiresAt: stacked },
      });
      return true;
    });

    if (activated) {
      // Best-effort receipt — skipped until BREVO_API_KEY is configured
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        // A missing receipt must not block an entitlement that is already
        // granted, but it must not disappear either: the old `void` turned a
        // failed send into silence.
        void this.email
          .sendReceipt(user.email, user.name, {
            plan: plan?.name ?? sub.planName,
            amount: `${(plan?.priceEtb ?? 0).toLocaleString()} ETB`,
            method: 'Syncourse premium',
          })
          .then((result) => {
            if (!result.sent) {
              this.logger.warn(`Receipt not sent for subscription ${sub.id} (${user.email})`);
            }
          })
          .catch((err) => {
            this.logger.warn(
              `Receipt failed for subscription ${sub.id}: ${(err as Error).message}`,
            );
          });
      }
    }
    return activated;
  }
}
