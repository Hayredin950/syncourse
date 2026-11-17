import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

/**
 * Fixed-duration premium plans (mirrors the reference's ETB/USD pricing):
 * direct plans do not renew automatically.
 */
export const PLANS = [
  { id: '1m', name: '1 Month', durationDays: 30, priceEtb: 149, priceUsd: 1.99, weeklyEtb: 35, isBestValue: false },
  { id: '3m', name: '3 Months', durationDays: 90, priceEtb: 349, priceUsd: 3.99, weeklyEtb: 27, isBestValue: false },
  { id: '6m', name: '6 Months', durationDays: 182, priceEtb: 549, priceUsd: 5.99, weeklyEtb: 21, isBestValue: true },
];

@Injectable()
export class PaymentsService {
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
      await this.activate(sub.userId, sub);
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
    await this.activate(sub.userId, sub);
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

  private async activate(userId: string, sub: { id: string; planName: string }) {
    const plan = PLANS.find((p) => p.id === sub.planName);
    const days = plan?.durationDays ?? 30;
    const now = new Date();
    // stacking: if a pass is running, add to what's left
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    const base = current?.planExpiresAt && current.planExpiresAt > now ? current.planExpiresAt : now;
    const stacked = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'approved', periodStart: now, periodEnd: stacked },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { planType: 'premium', planExpiresAt: stacked },
    });
    // Best-effort receipt — skipped until BREVO_API_KEY is configured
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      void this.email.sendReceipt(user.email, user.name, {
        plan: plan?.name ?? sub.planName,
        amount: `${(plan?.priceEtb ?? 0).toLocaleString()} ETB`,
        method: 'Syncourse premium',
      });
    }
  }
}
