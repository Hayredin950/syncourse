import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AdminService } from './admin.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';

class AdminLessonDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  durationSec?: number;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isPreview?: boolean;
}

class AdminSectionDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminLessonDto)
  lessons?: AdminLessonDto[];
}

class AdminCourseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryNames?: string[];

  @IsOptional()
  @IsString()
  levelName?: string;

  @IsOptional()
  @IsString()
  lecturerName?: string;

  @IsOptional()
  @IsString()
  organizationName?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsNumber()
  originalPrice?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audience?: string[];

  @IsOptional()
  @IsString()
  prerequisites?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  previewVideoUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminSectionDto)
  sections?: AdminSectionDto[];
}

class UpdateCoverDto {
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  bannerUrl?: string;
}

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('courses')
  list(@CurrentUser() user: AuthUser) {
    return this.admin.listCourses(user.id);
  }

  @Get('courses/:slug')
  get(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.admin.getCourse(user.id, slug);
  }

  @Post('courses')
  create(@CurrentUser() user: AuthUser, @Body() dto: AdminCourseDto) {
    return this.admin.createCourse(user.id, dto);
  }

  @Patch('courses/:slug')
  update(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: AdminCourseDto) {
    return this.admin.updateCourse(user.id, slug, dto);
  }

  @Delete('courses/:slug')
  remove(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.admin.deleteCourse(user.id, slug);
  }

  /** Staff-only. Attach a Cloudinary (or any https) image URL as the course cover. */
  @Post('courses/:slug/cover')
  updateCover(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: UpdateCoverDto) {
    return this.admin.updateCourseCover(user.id, slug, dto);
  }
}
