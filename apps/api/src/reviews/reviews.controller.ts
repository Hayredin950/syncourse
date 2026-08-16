import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { Public } from '../common/public.decorator';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

class RateDto {
  @IsInt()
  @Min(1)
  @Max(5)
  stars: number;
}

class ReviewDto {
  @IsString()
  body: string;

  @IsOptional()
  @IsBoolean()
  containsSpoilers?: boolean;

  @IsOptional()
  @IsString()
  parentId?: string;
}

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('courses/:id/rate')
  rate(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: RateDto) {
    return this.reviews.rate(user.id, id, dto.stars);
  }

  @Post('courses/:id/reviews')
  postReview(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ReviewDto) {
    return this.reviews.postReview(user.id, id, dto.body, dto.containsSpoilers ?? false, dto.parentId);
  }

  @Public()
  @Get('courses/:id/reviews')
  listReviews(@Param('id') id: string, @Query('sort') sort?: string, @Query('page') page?: string) {
    return this.reviews.listReviews(id, (sort as 'top' | 'newest') || 'newest', page ? Number(page) : 1);
  }
}
