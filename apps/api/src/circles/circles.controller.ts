import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CirclesService } from './circles.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { Public } from '../common/public.decorator';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

class CreateCircleDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateCircleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class CreatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  /** Optional course recommendation carried by the post. */
  @IsOptional()
  @IsString()
  courseId?: string;
}

@Controller()
export class CirclesController {
  constructor(private readonly circles: CirclesService) {}

  @Public()
  @Get('circles')
  list(@CurrentUser() user?: AuthUser) {
    return this.circles.list(user?.id);
  }

  @Post('circles')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCircleDto) {
    return this.circles.create(user.id, dto.name, dto.description);
  }

  @Post('circles/:id/join')
  join(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.circles.join(user.id, id);
  }

  @Post('circles/:id/leave')
  leave(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.circles.leave(user.id, id);
  }

  @Patch('circles/:id')
  update(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateCircleDto) {
    return this.circles.update(user.id, id, dto);
  }

  @Delete('circles/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.circles.remove(user.id, id);
  }

  @Post('circles/:id/posts')
  createPost(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    return this.circles.createPost(user.id, id, dto.body, dto.courseId);
  }

  @Delete('circles/:id/posts/:postId')
  deletePost(@Param('id') id: string, @Param('postId') postId: string, @CurrentUser() user: AuthUser) {
    return this.circles.deletePost(user.id, id, postId);
  }

  @Delete('circles/:id/members/:memberId')
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.circles.removeMember(user.id, id, memberId);
  }

  @Public()
  @Get('circles/:id')
  detail(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.circles.detail(id, user?.id);
  }

  @Get('activity')
  feed(@CurrentUser() user: AuthUser) {
    return this.circles.feed(user.id);
  }
}
