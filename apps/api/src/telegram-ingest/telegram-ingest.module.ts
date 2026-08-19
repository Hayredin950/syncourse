import { Module } from '@nestjs/common';
import { TelegramIngestController } from './telegram-ingest.controller';
import { TelegramIngestService } from './telegram-ingest.service';
import { TelegramPreviewClient } from './telegram-preview.client';
import { FeedImporter } from './feed-importer';

/**
 * Telegram channel ingestion — scrapes https://t.me/s/<channel> (or consumes
 * pasted transcripts) and imports courses into Category → Course → Section
 * (module) → Lesson (part). PrismaModule is global.
 */
@Module({
  controllers: [TelegramIngestController],
  providers: [TelegramIngestService, TelegramPreviewClient, FeedImporter],
  exports: [TelegramIngestService, FeedImporter],
})
export class TelegramIngestModule {}
