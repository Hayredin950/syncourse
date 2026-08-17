import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Public()
  @Get('status')
  status() {
    return this.telegram.status();
  }
}
