import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ContentService } from './content.service';
import { Public } from '../common/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { IsOptional, IsString } from 'class-validator';

class DownloadDto {
  @IsOptional()
  @IsString()
  quality?: string;

  @IsOptional()
  @IsString()
  method?: string;
}

@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Public()
  @Get('lessons/:id')
  lessonDetail(@Param('id') id: string) {
    return this.content.lessonDetail(id);
  }

  @Get('lessons/:id/video-url')
  videoUrl(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.content.getVideoUrl(id, user.id);
  }

  @Get('lessons/:id/file-url')
  fileUrl(@Param('id') id: string, @Query('attachmentId') attachmentId: string, @CurrentUser() user: AuthUser) {
    return this.content.getFileUrl(id, user.id, attachmentId);
  }

  @Post('lessons/:id/download')
  recordDownload(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: DownloadDto) {
    return this.content.recordDownload(id, user.id, dto.quality, dto.method || 'app');
  }

  @Post('lessons/:id/download-to-telegram')
  downloadToTelegram(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.content.downloadToTelegram(id, user.id);
  }

  @Public()
  @Get('courses/:courseId/downloads/stats')
  downloadStats(@Param('courseId') courseId: string, @Query('slug') slug?: string) {
    return this.content.courseDownloadStats(courseId);
  }
}
