import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, ForbiddenException } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService, TelegramUpdate } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Bot health and activity. This used to be public, which leaked chat ids,
   * channel usernames, file names and who did what to anyone who asked. It is
   * console data for operators, so it now requires staff.
   */
  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isStaff: true },
    });
    if (!dbUser?.isStaff) throw new ForbiddenException('Staff access required');
    return this.telegram.status();
  }

  /**
   * Telegram POSTs every bot update here when the API is deployed on Vercel —
   * a serverless function can't hold the getUpdates long-poll the bot used on
   * Render. Verified with the shared secret Telegram echoes back in the
   * x-telegram-bot-api-secret-token header (see TELEGRAM_WEBHOOK_SECRET).
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    return this.telegram.handleWebhook(update, secret);
  }
}
