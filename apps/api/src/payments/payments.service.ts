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
  async checkout(_userId: string, _planId: string, _method: string, _currency = 'ETB') {
    // Every path now goes through the gateway's hosted checkout. The old manual
    // / crypto / Stripe branches created a pending row and then sent the shopper
    // somewhere that could not confirm it, which is how the review queue filled
    // with orders nobody could settle. Failing before anything is written also
    // means an abandoned attempt leaves no row behind.
    throw new BadRequestException(
      'Payments now open the secure CBE / Telebirr / M-Pesa checkout. Use /payments/tikur/checkout.',
    );
  }

  /** Telebirr manual flow — submit the transaction reference from the SMS. */
  async submitReference(userId: string, subscriptionId: string, reference: string) {
    const raw = reference.trim();
    if (!raw) throw new BadRequestException('Transaction reference is required');
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || sub.userId !== userId) throw new NotFoundException('Subscription not found');
    if (sub.status === 'approved') {
      return {
        submitted: true,
        status: 'approved',
        verified: true,
        message: 'This order is already paid — Premium is active.',
      };
    }
    if (sub.status !== 'pending') throw new BadRequestException('That order is no longer open.');

    const normalized = TikurPayClient.normalizeReference(raw);
    // The same transfer must never buy a second account. Check both the
    // automated rail's unique column and previously verified manual claims
    // before spending a gateway credit on the lookup.
    const [tikurUsed, manualUsed] = await Promise.all([
      this.prisma.tikurPayment.findUnique({ where: { reference: normalized }, select: { id: true } }),
      this.prisma.paymentReference.findFirst({
        where: {
          reference: { in: [raw, normalized], mode: 'insensitive' },
          verified: true,
          NOT: { subscriptionId },
        },
        select: { id: true },
      }),
    ]);
    if (tikurUsed || manualUsed) {
      throw new BadRequestException(
        'That receipt has already been used to unlock another account. Each transfer can only be claimed once.',
      );
    }

    const stored = await this.prisma.paymentReference.create({
      data: { subscriptionId, reference: raw },
    });
    const pendingReview = {
      submitted: true,
      status: sub.status,
      verified: false,
      message:
        'Reference received. We could not reach the bank right now, so it is queued for a person to check — you will not be charged twice.',
    };
    if (!this.tikur.configured) return pendingReview;

    /**
     * A receipt the gateway can read and reject is not a maybe. Leaving that
     * order pending was the bug: the fake reference sat in the admin queue
     * forever, the shopper saw "submitted", and nobody was told anything.
     * This closes the order with the bank's own reason so both sides see a
     * decision. An unreachable gateway still falls back to review above.
     */
    const reject = async (message: string) => {
      await this.prisma.subscription.updateMany({
        where: { id: sub.id, status: 'pending' },
        data: { status: 'rejected', txReference: normalized },
      });
      return { submitted: false, status: 'rejected', verified: false, message };
    };

    // The gateway can verify the same receipt against the bank ledger, so try
    // that first and only fall back to human review when the lookup itself
    // failed (timeout, outage, missing key).
    let result;
    try {
      result = await this.tikur.verifyReference(raw, sub.paymentMethod === 'telebirr' ? 'telebirr' : undefined);
    } catch (err) {
      if (err instanceof BadRequestException) {
        // 400/422 means the provider read the receipt and refused it: "no data
        // found", "already claimed". That is a final answer, not a queue item.
        return reject(err.message);
      }
      this.logger.warn(`Manual reference ${raw} could not be auto-verified: ${(err as Error).message}`);
      return pendingReview;
    }

    if (result.verified !== true || result.success === false) {
      return reject(result.message || 'The bank could not find a completed transfer for that receipt.');
    }
    if (typeof result.amount === 'number' && Math.abs(result.amount - sub.amount) > 0.01) {
      return reject(
        `That transfer was ${result.amount.toLocaleString()} ETB but this plan costs ${sub.amount.toLocaleString()} ETB. Nothing was unlocked.`,
      );
    }
    if (!this.receiverIsOurs(result.receiverName)) {
      return reject('That transfer did not land in a Syncourse receiving account. Nothing was unlocked.');
    }

    const activated = await this.activate(sub.userId, sub);
    await this.prisma.paymentReference.update({ where: { id: stored.id }, data: { verified: true } });
    if (activated) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { txReference: normalized, periodStart: new Date() },
      });
    }
    return {
      submitted: true,
      status: activated ? 'approved' : sub.status,
      verified: activated,
      message: activated
        ? 'Payment verified — Premium is unlocked.'
        : 'That payment was already applied.',
    };
  }

  /**
   * Did this transfer land in one of our configured receiving accounts?
   *
   * Wallet numbers come back masked (`2519****0736`), so the account field is
   * not reliable on its own. The holder name is: the gateway reads it from the
   * bank, and it must contain a token from one of our rails.
   */
  private receiverIsOurs(receiverName: string | null | undefined): boolean {
    const name = (receiverName ?? '').toLowerCase();
    if (!name) return false;
    const tokens = Object.values(this.tikur.rails)
      .map((rail) => rail.accountName?.toLowerCase() ?? '')
      .join(' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3);
    return tokens.some((token) => name.includes(token));
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
   * server, so the checkout UI shows "payments are briefly unavailable" rather
   * than offering a button that can only fail. The account details returned are
   * the same ones the hosted checkout would display — they are the merchant's
   * receiving account, never a secret.
   */
  tikurConfig() {
    return {
      enabled: this.tikur.configured,
      businessName: (process.env.TIKURPAY_BUSINESS_NAME || 'Syncourse').trim(),
      timeoutMinutes: this.tikur.timeoutMinutes,
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
        'Card and wallet checkout is not switched on yet. Please try again shortly.',
      );
    }

    // Only the newest checkout is the one the shopper is looking at. Opening
    // the page a few times used to leave a trail of payable-looking pending
    // orders (and a "finish your payment" nag for a 15-minute session that had
    // already died), so the previous session is retired first.
    await this.prisma.subscription.updateMany({
      where: { userId, status: 'pending', paymentMethod: 'tikurpay' },
      data: { status: 'expired' },
    });

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
