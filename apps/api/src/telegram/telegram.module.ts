import { Module } from '@nestjs/common';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { TelegramIngestModule } from '../telegram-ingest/telegram-ingest.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  // The watcher lives in telegram-ingest; the bot only renders its drafts.
  imports: [CloudinaryModule, TelegramIngestModule],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
