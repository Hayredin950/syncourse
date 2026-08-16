import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { Public } from '../common/public.decorator';

@Public()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  doSearch(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.searchService.search(q ?? '', { limit: limit ? Number(limit) : undefined });
  }

  @Get('trending')
  trending() {
    return this.searchService.trending();
  }
}
