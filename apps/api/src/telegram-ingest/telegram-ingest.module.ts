import { Module } from '@nestjs/common';
import { TelegramIngestController } from './telegram-ingest.controller';
import { TelegramIngestService } from './telegram-ingest.service';
import { TelegramPreviewClient } from './telegram-preview.client';
import { FeedImporter } from './feed-importer';
import { IngestDraftService } from './draft.service';
import { TelegramMediaResolver } from './media-resolver.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

/**
 * Telegram channel ingestion — scrapes https://t.me/s/<channel> (or consumes
 * pasted transcripts) and imports courses into Category → Course → Section
 * (module) → Lesson (part). PrismaModule is global.
 *
 * `IngestDraftService` is exported because the bot (TelegramModule) feeds it
 * every group message and renders the drafts it proposes. The media resolver
 * mirrors photos to Cloudinary, so approval works from the bot and from the
 * admin console alike.
 */
@Module({
  imports: [CloudinaryModule],
  controllers: [TelegramIngestController],
  providers: [TelegramIngestService, TelegramPreviewClient, FeedImporter, IngestDraftService, TelegramMediaResolver],
  exports: [TelegramIngestService, FeedImporter, IngestDraftService],
})
export class TelegramIngestModule {}
