import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { RecommendationsService } from './recommendations.service';

/**
 * Recommendations are a read, so both endpoints are public. They still accept a
 * bearer token opportunistically: a signed-in reader gets "for you" and the
 * `saved` flag on every card.
 */
@Public()
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get('similar/:slug')
  similar(
    @Param('slug') slug: string,
    @CurrentUser() user?: AuthUser,
    @Query('limit') limit?: string,
  ) {
    return this.recommendations.similar(slug, user?.id, limit !== undefined ? Number(limit) : 8);
  }

  @Get('for-you')
  forYou(@CurrentUser() user?: AuthUser, @Query('limit') limit?: string) {
    return this.recommendations.forYou(user?.id, limit !== undefined ? Number(limit) : 10);
  }
}
