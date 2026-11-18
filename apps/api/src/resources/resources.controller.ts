import { Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ResourcesService } from './resources.service';
import { Public } from '../common/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';

/** Download counts are cheap but public: keep one client from filling the ledger. */
const LIMIT_DOWNLOAD = { default: { limit: 20, ttl: 60_000 } };

/**
 * Public reads for cheat-sheets, roadmaps and notes. Authoring lives in
 * AdminController, behind the same staff check as the rest of the catalogue.
 * Counting a download is the exception: it needs a reader behind it.
 */
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Public()
  @Get()
  list(
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('organization') organization?: string,
    @Query('lecturer') lecturer?: string,
    @Query('tag') tag?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.resources.list({
      type,
      category,
      organization,
      lecturer,
      tag,
      q,
      sort,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Public()
  @Get(':slug')
  detail(
    @Param('slug') slug: string,
    @CurrentUser() user?: AuthUser,
    @Headers('purpose') purpose?: string,
    @Headers('sec-purpose') secPurpose?: string,
  ) {
    // Browsers and link unfurlers pre-fetch detail pages; those reads are not
    // readers. Pass the flag down so the counter only moves for real visits.
    const prefetched = `${purpose ?? ''} ${secPurpose ?? ''}`.toLowerCase().includes('prefetch');
    return this.resources.detailBySlug(slug, user?.id, !prefetched);
  }

  /** Deliberately not `@Public()`: an anonymous counter is an inflatable one. */
  @Throttle(LIMIT_DOWNLOAD)
  @Post(':slug/download')
  download(@Param('slug') slug: string) {
    return this.resources.countDownload(slug);
  }
}
