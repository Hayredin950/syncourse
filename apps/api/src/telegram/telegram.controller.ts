import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Public } from '../common/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService, TelegramUpdate } from './telegram.service';

class ScanGroupDto {
  /** Start after this message id. Omit to resume from the saved cursor. */
  @IsOptional()
  @IsInt()
  @Min(0)
  from?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  max?: number;

  @IsOptional()
  @IsInt()
  topicId?: number;

  /** Ignore the in-flight lock (used by the recovery run). */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

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

  /**
   * Ingest the group posts that Telegram never delivered.
   *
   * A bot is not sent the messages it posts itself, so a course published as
   * @syncourse_bot is invisible to the webhook. This walks the group's message
   * ids forward, borrows each one, and feeds the bot's own posts to the
   * watcher. Operators can run it from the console; the scheduled workflow uses
   * `scan/cron` with a shared secret.
   */
  @Post('scan')
  @HttpCode(HttpStatus.OK)
  async scan(@Body() body: ScanGroupDto, @CurrentUser() user: AuthUser) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isStaff: true },
    });
    if (!dbUser?.isStaff) throw new ForbiddenException('Staff access required');
    return this.telegram.scanOwnPosts(body);
  }

  /** The same scan for a scheduler — no user session, a shared secret instead. */
  @Public()
  @Post('scan/cron')
  @HttpCode(HttpStatus.OK)
  async scanCron(@Headers('x-scan-secret') secret?: string, @Body() body?: ScanGroupDto) {
    const expected = (process.env.TELEGRAM_SCAN_SECRET ?? '').trim();
    if (!expected || secret !== expected) throw new ForbiddenException('invalid scan secret');
    return this.telegram.scanOwnPosts(body);
  }
}
