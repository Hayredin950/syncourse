/**
 * telegram-ingest.service.ts
 *
 * Orchestrates Telegram feed ingestion: fetch (or paste) → parse → import.
 *
 *   preview()        — fetch + parse only, no DB writes (safe to inspect)
 *   importChannel()  — scrape https://t.me/s/<name> and import into the DB
 *   importPastedText — parse a pasted channel transcript and import
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramPreviewClient } from './telegram-preview.client';
import { FeedImporter, ImportOptions, ImportResult } from './feed-importer';
import { buildFeed, parsePastedText } from './telegram-feed.parser';

export interface PreviewResult {
  channelUsername: string | null;
  channelTitle: string | null;
  subscribers: number | null;
  rawMessages: number;
  skipped: number;
  courses: Array<{
    title: string;
    slug: string;
    durationMin: number | null;
    lessonCount: number | null;
    taughtBy: string[];
    sourceUrl: string | null;
    modules: Array<{ title: string; parts: number }>;
  }>;
  orphanParts: number;
}

@Injectable()
export class TelegramIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: TelegramPreviewClient,
    private readonly importer: FeedImporter,
  ) {}

  async preview(username: string, maxPages = 3): Promise<PreviewResult> {
    const { messages, meta } = await this.client.fetchChannel(username, { maxPages });
    const feed = buildFeed(messages, {
      channelUsername: username,
      channelTitle: meta.title,
      subscribers: meta.subscribers,
    });
    return this.shapePreview(feed);
  }

  async importChannel(username: string, opts: ImportOptions = {}): Promise<ImportResult> {
    const { messages, meta } = await this.client.fetchChannel(username, { maxPages: opts.maxPages ?? 3 });
    const feed = buildFeed(messages, {
      channelUsername: username,
      channelTitle: meta.title,
      subscribers: meta.subscribers,
    });
    return this.importer.importFeed(feed, { ...opts, channelUsername: username });
  }

  async importPastedText(text: string, opts: ImportOptions = {}): Promise<ImportResult> {
    const messages = parsePastedText(text);
    const feed = buildFeed(messages, {
      channelUsername: opts.channelUsername ?? null,
      channelTitle: opts.channelTitle ?? null,
    });
    return this.importer.importFeed(feed, opts);
  }

  async previewPastedText(text: string, channelUsername?: string, channelTitle?: string): Promise<PreviewResult> {
    const messages = parsePastedText(text);
    const feed = buildFeed(messages, { channelUsername: channelUsername ?? null, channelTitle: channelTitle ?? null });
    return this.shapePreview(feed);
  }

  private shapePreview(feed: ReturnType<typeof buildFeed>): PreviewResult {
    return {
      channelUsername: feed.channelUsername,
      channelTitle: feed.channelTitle,
      subscribers: feed.subscribers,
      rawMessages: feed.rawCount,
      skipped: feed.skipped,
      courses: feed.courses.map((c) => ({
        title: c.title,
        slug: c.slug,
        durationMin: c.durationMin,
        lessonCount: c.lessonCount,
        taughtBy: c.taughtBy,
        sourceUrl: c.sourceUrl,
        modules: c.sections.map((s) => ({ title: s.title, parts: s.parts.length })),
      })),
      orphanParts: feed.orphanParts.length,
    };
  }
}
