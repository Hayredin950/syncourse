import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { SearchService } from './search.service';
import { Public } from '../common/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';

class SearchClickDto {
  /** What the reader was looking for when they picked this course. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  query!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  courseId!: string;
}

@Public()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  doSearch(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.searchService.search(q ?? '', {
      limit: limit !== undefined ? Number(limit) : undefined,
      offset: offset !== undefined ? Number(offset) : undefined,
    });
  }

  @Get('trending')
  trending() {
    return this.searchService.trending();
  }

  /**
   * A result was opened. This is what turns "people searched for X" into
   * "people searching for X chose this course", which the ranking uses as a
   * small tie-breaker.
   *
   * 202, not 201: the client fires this and navigates away without reading the
   * body, and a failed write must never block opening the course.
   */
  @Post('click')
  @HttpCode(HttpStatus.ACCEPTED)
  click(@Body() dto: SearchClickDto, @CurrentUser() user?: AuthUser) {
    return this.searchService.recordClick(dto.query, dto.courseId, user?.id);
  }
}
