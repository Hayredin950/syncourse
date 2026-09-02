import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { Public } from '../common/public.decorator';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

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

class UpdateListDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: 'public' | 'private';
}

class ItemDto {
  @IsOptional()
  @IsString()
  courseId?: string;

  /** The picker can tick several courses before it closes. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  courseIds?: string[];
}

@Controller()
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get('me/lists')
  myLists(@CurrentUser() user: AuthUser) {
    return this.collections.myLists(user.id);
  }

  /** Powers "Add to list" on a course page: my lists plus whether each holds it. */
  @Get('me/lists/for-course')
  listsForCourse(@CurrentUser() user: AuthUser, @Query('courseId') courseId: string) {
    return this.collections.listsForCourse(user.id, courseId);
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

  @Patch('lists/:id')
  updateList(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateListDto) {
    return this.collections.updateList(user.id, id, dto);
  }

  @Post('lists/:id/items')
  addItem(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ItemDto) {
    const ids = dto.courseIds ?? (dto.courseId ? [dto.courseId] : []);
    if (!ids.length) throw new BadRequestException('Pick at least one course');
    return ids.length === 1
      ? this.collections.addItem(user.id, id, ids[0])
      : this.collections.addItems(user.id, id, ids);
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
