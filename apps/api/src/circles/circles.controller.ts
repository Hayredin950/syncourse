import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CirclesService } from './circles.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { Public } from '../common/public.decorator';
import { IsOptional, IsString, MinLength } from 'class-validator';

class CreateCircleDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
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
