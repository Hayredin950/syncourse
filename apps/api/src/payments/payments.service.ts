import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { PLANS, premiumExpiresAt } from './plans';

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
      case 'telebirr':
        return {
          subscriptionId: subscription.id,
          plan: { ...plan, amount, currency },
          status: 'pending',
          steps: {
            step1: {
              title: 'Send money',
              text: `Send ${amount.toLocaleString()} ${currency} with Telebirr to the account below`,
              accountName: process.env.TELEBIRR_ACCOUNT_NAME || 'Syncourse',
              accountNumber: process.env.TELEBIRR_ACCOUNT_NUMBER || '0000000000',
            },
            step2: {
              title: 'Submit your transaction number',
              hint: "It's on your Telebirr receipt, next to 'Transaction Number'",
            },
          },
        };
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
