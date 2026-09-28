import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { TelegramService, TelegramUpdate } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Public()
  @Get('status')
  status() {
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
