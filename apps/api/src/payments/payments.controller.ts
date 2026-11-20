import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { Public } from '../common/public.decorator';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

class CheckoutDto {
  @IsString()
  planId: string;

  @IsIn(['telebirr', 'crypto', 'stripe', 'patreon'])
  method: string;

  @IsOptional()
  @IsIn(['ETB', 'USD'])
  currency?: 'ETB' | 'USD';
}

/**
 * Tikur Pay picks the rail itself, so the client only sends the plan.
 * Reusing CheckoutDto here required a `method` that neither the web page nor
 * the Flutter app sends, and validation rejected every bank checkout with a
 * 400 before it reached the gateway.
 */
class TikurCheckoutDto {
  @IsString()
  planId: string;
}

class ReferenceDto {
  @IsString()
  @MinLength(4)
  reference: string;
}

class TikurVerifyDto {
  @IsString()
  subscriptionId: string;

  /** The bank receipt URL or the FT transaction number from the customer. */
  @IsString()
  @MinLength(4)
  transactionLink: string;

  @IsOptional()
  @IsString()
  bank?: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Get('plans')
  plans() {
    return this.payments.plans();
  }

  @Post('checkout')
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.payments.checkout(user.id, dto.planId, dto.method, dto.currency ?? 'ETB');
  }

  @Post('subscriptions/:id/reference')
  submitReference(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ReferenceDto) {
    return this.payments.submitReference(user.id, id, dto.reference);
  }

  @Post('subscriptions/:id/verify')
  verify(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('approved') approved?: string,
  ) {
    return this.payments.verifySubscription(user.id, id, approved !== 'false');
  }

  @Public()
  @Post('webhook/:provider/:subscriptionId')
  webhook(
    @Param('provider') provider: string,
    @Param('subscriptionId') subscriptionId: string,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    return this.payments.webhookActivate(subscriptionId, provider, secret);
  }

  @Get('me')
  mySubscription(@CurrentUser() user: AuthUser) {
    return this.payments.mySubscription(user.id);
  }

  // --- Tikur Pay: Ethiopian bank & wallet transfers, verified automatically --

  /** Feature flag and receiving rails for the checkout page. */
  @Public()
  @Get('tikur/config')
  tikurConfig() {
    return this.payments.tikurConfig();
  }

  @Post('tikur/checkout')
  tikurCheckout(@CurrentUser() user: AuthUser, @Body() dto: TikurCheckoutDto) {
    return this.payments.tikurCheckout(user.id, dto.planId);
  }

  /** Submit the receipt; the gateway decides and Premium follows immediately. */
  @Post('tikur/verify')
  tikurVerify(@CurrentUser() user: AuthUser, @Body() dto: TikurVerifyDto) {
    return this.payments.tikurVerify(user.id, dto.subscriptionId, dto.transactionLink, dto.bank);
  }

  /** Reconcile after a redirect or a delayed webhook. */
  @Get('tikur/status/:paymentNumber')
  tikurStatus(@CurrentUser() user: AuthUser, @Param('paymentNumber') paymentNumber: string) {
    return this.payments.tikurStatus(user.id, paymentNumber);
  }

  /**
   * The signed server-to-server callback.
   *
   * Public by necessity — the gateway has no user session — so the HMAC over
   * the raw body is the authentication. `rawBody: true` in main.ts preserves
   * the exact bytes; re-serialising the parsed JSON would break the signature.
   */
  @Public()
  @Post('tikur/webhook')
  tikurWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-tikurpay-signature') signature?: string,
    @Body() body?: unknown,
  ) {
    return this.payments.tikurWebhook(req.rawBody, signature, body);
  }
}
