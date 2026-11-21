import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { AssistantService } from './assistant.service';
import { AssistantActionsService } from './actions.service';
import { AskDto } from './dto/ask.dto';
import { ConfirmActionDto, ProposeActionDto } from './dto/action.dto';

/**
 * The assistant is readable by anyone: a visitor deciding whether to sign up is
 * exactly who needs the catalogue explained. A bearer token is used when
 * present, because premium gating and the daily budget depend on who is asking.
 *
 * `@Throttle` is a burst guard in front of the per-day DB budget. It is per IP
 * per warm instance, so it is deliberately generous — the durable limit is the
 * `AssistantUsage` row.
 */
@Public()
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  status(@CurrentUser() user?: AuthUser) {
    return this.assistant.statusFor(user?.id);
  }

  @Post('ask')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  ask(@Body() dto: AskDto, @CurrentUser() user?: AuthUser, @Req() req?: Request) {
    // Vercel forwards the real client address; `req.ip` would be the edge proxy
    // and put every visitor in one daily bucket.
    const forwarded = (req?.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    return this.assistant.ask(dto.question, {
      courseSlug: dto.courseSlug,
      userId: user?.id,
      ip: forwarded || req?.ip,
      history: dto.history,
    });
  }
}

/**
 * Write path. Deliberately a separate controller so it cannot inherit the
 * `@Public()` above: a signed-in staff member is required for every call, and
 * the confirmation is a second, separately signed request.
 */
@Controller('assistant/actions')
export class AssistantActionsController {
  constructor(private readonly actions: AssistantActionsService) {}

  @Post('propose')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  propose(@Body() dto: ProposeActionDto, @CurrentUser() user: AuthUser) {
    return this.actions.propose(user.id, dto.instruction);
  }

  @Post('confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirm(@Body() dto: ConfirmActionDto, @CurrentUser() user: AuthUser) {
    return this.actions.confirm(user.id, dto.token);
  }
}
