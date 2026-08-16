import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { Public } from '../common/public.decorator';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

class CreateListDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: 'public' | 'private';
}

class ItemDto {
  @IsString()
  courseId: string;
}

@Controller()
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get('me/lists')
  myLists(@CurrentUser() user: AuthUser) {
    return this.collections.myLists(user.id);
  }

  @Post('lists')
  createList(@CurrentUser() user: AuthUser, @Body() dto: CreateListDto) {
    return this.collections.createList(user.id, dto.name, dto.description, dto.visibility ?? 'private');
  }

  @Public()
  @Get('lists')
  browseLists(
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.collections.browseLists({
      q,
      sort,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Public()
  @Get('lists/:id')
  getList(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.collections.getList(id, user?.id);
  }

  @Post('lists/:id/items')
  addItem(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ItemDto) {
    return this.collections.addItem(user.id, id, dto.courseId);
  }

  @Delete('lists/:id/items/:courseId')
  removeItem(@Param('id') id: string, @Param('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.collections.removeItem(user.id, id, courseId);
  }

  @Delete('lists/:id')
  deleteList(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.collections.deleteList(user.id, id);
  }

  @Post('lists/:id/save')
  saveList(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.collections.saveList(user.id, id);
  }
}
