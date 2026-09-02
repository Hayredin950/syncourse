import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { Public } from '../common/public.decorator';

/**
 * Public reads for cheat-sheets, roadmaps and notes. Authoring lives in
 * AdminController, behind the same staff check as the rest of the catalogue.
 */
@Public()
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

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

  @Get(':slug')
  detail(@Param('slug') slug: string) {
    return this.resources.detailBySlug(slug);
  }

  @Post(':slug/download')
  download(@Param('slug') slug: string) {
    return this.resources.countDownload(slug);
  }
}
