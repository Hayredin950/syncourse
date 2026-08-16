import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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

class ReferenceDto {
  @IsString()
  @MinLength(4)
  reference: string;
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
  verify(@Param('id') id: string, @Query('approved') approved?: string) {
    return this.payments.verifySubscription(id, approved !== 'false');
  }

  @Public()
  @Post('webhook/:provider/:subscriptionId')
  webhook(@Param('provider') provider: string, @Param('subscriptionId') subscriptionId: string) {
    // Production: verify provider signature (Stripe signature header, etc.)
    return this.payments.webhookActivate(subscriptionId, provider);
  }

  @Get('me')
  mySubscription(@CurrentUser() user: AuthUser) {
    return this.payments.mySubscription(user.id);
  }
}
