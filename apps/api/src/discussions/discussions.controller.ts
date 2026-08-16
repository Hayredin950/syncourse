import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DiscussionsService } from './discussions.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { Public } from '../common/public.decorator';
import { IsOptional, IsString, MinLength } from 'class-validator';

class PostDto {
  @IsString()
  @MinLength(1)
  body: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

@Controller()
export class DiscussionsController {
  constructor(private readonly discussions: DiscussionsService) {}

  @Public()
  @Get('courses/:id/discussion')
  threads(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.discussions.threads(id, user?.id);
  }

  @Post('courses/:id/discussion')
  post(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: PostDto) {
    return this.discussions.post(user.id, id, dto.body, dto.parentId);
  }

  @Post('discussion/:reviewId/upvote')
  upvote(@Param('reviewId') reviewId: string, @CurrentUser() user: AuthUser) {
    return this.discussions.toggleUpvote(user.id, reviewId);
  }
}
