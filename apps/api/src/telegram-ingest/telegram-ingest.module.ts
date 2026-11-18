import { Module } from '@nestjs/common';
import { TelegramIngestController } from './telegram-ingest.controller';
import { TelegramIngestService } from './telegram-ingest.service';
import { TelegramPreviewClient } from './telegram-preview.client';
import { FeedImporter } from './feed-importer';
import { IngestDraftService } from './draft.service';

/**
 * Telegram channel ingestion — scrapes https://t.me/s/<channel> (or consumes
 * pasted transcripts) and imports courses into Category → Course → Section
 * (module) → Lesson (part). PrismaModule is global.
 *
 * `IngestDraftService` is exported because the bot (TelegramModule) feeds it
 * every group message and renders the drafts it proposes.
 */
@Module({
  controllers: [TelegramIngestController],
  providers: [TelegramIngestService, TelegramPreviewClient, FeedImporter, IngestDraftService],
  exports: [TelegramIngestService, FeedImporter, IngestDraftService],
})
export class TelegramIngestModule {}
