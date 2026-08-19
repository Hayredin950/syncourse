/**
 * telegram-ingest.controller.ts
 *
 * Admin endpoints for importing Telegram course channels into the catalog.
 * All routes are JWT-protected and staff-only.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramIngestService } from './telegram-ingest.service';

class PreviewChannelDto {
  @IsString()
  channel: string;

  @IsOptional()
  @IsNumber()
  maxPages?: number;
}

class ImportChannelDto {
  @IsString()
  username: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categorySlugs?: string[];

  @IsOptional()
  @IsNumber()
  maxCourses?: number;

  @IsOptional()
  @IsNumber()
  maxPages?: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

class ImportPasteDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  channelUsername?: string;

  @IsOptional()
  @IsString()
  channelTitle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categorySlugs?: string[];

  @IsOptional()
  @IsNumber()
  maxCourses?: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

@Controller('telegram-ingest')
export class TelegramIngestController {
  constructor(
    private readonly ingest: TelegramIngestService,
    private readonly prisma: PrismaService,
  ) {}

  /** Parse a public channel feed without writing anything. */
  @Get('preview')
  async preview(@Query() q: PreviewChannelDto, @CurrentUser() user: AuthUser) {
    await this.assertStaff(user);
    return this.ingest.preview(q.channel, q.maxPages ?? 3);
  }

  /** Scrape https://t.me/s/<username> and import the parsed courses. */
  @Post('import')
  async importChannel(@Body() body: ImportChannelDto, @CurrentUser() user: AuthUser) {
    await this.assertStaff(user);
    return this.ingest.importChannel(body.username, {
      categorySlugs: body.categorySlugs,
      maxCourses: body.maxCourses,
      maxPages: body.maxPages,
      dryRun: body.dryRun,
    });
  }

  /** Import a pasted channel transcript (e.g. exported from Telegram Desktop). */
  @Post('import-paste')
  async importPaste(@Body() body: ImportPasteDto, @CurrentUser() user: AuthUser) {
    await this.assertStaff(user);
    return this.ingest.importPastedText(body.text, {
      categorySlugs: body.categorySlugs,
      maxCourses: body.maxCourses,
      dryRun: body.dryRun,
      channelUsername: body.channelUsername,
      channelTitle: body.channelTitle,
    });
  }

  /** Dry-run a pasted transcript so you can inspect the parse before importing. */
  @Post('preview-paste')
  async previewPaste(@Body() body: ImportPasteDto, @CurrentUser() user: AuthUser) {
    await this.assertStaff(user);
    return this.ingest.previewPastedText(body.text, body.channelUsername, body.channelTitle);
  }

  private async assertStaff(user: AuthUser) {
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.isStaff) throw new ForbiddenException('Staff access required');
  }
}
