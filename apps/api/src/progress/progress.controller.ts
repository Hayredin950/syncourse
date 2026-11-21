import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IsBoolean, IsString } from 'class-validator';
import { ProgressService } from './progress.service';
import { Public } from '../common/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';

class LessonProgressDto {
  @IsBoolean()
  completed: boolean;
}

class UnitProgressDto {
  @IsString()
  unitId: string;

  @IsBoolean()
  completed: boolean;
}

@Controller()
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /** Progress is per-viewer but readable by anyone; signed-out callers get zeros. */
  @Public()
  @Get('courses/:slug/progress')
  courseProgress(@Param('slug') slug: string, @CurrentUser() user?: AuthUser) {
    return this.progress.courseProgress(slug, user?.id);
  }

  @Post('courses/:slug/progress')
  setCourseUnitProgress(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UnitProgressDto,
  ) {
    return this.progress.setCourseUnitProgress(user.id, slug, dto.unitId, dto.completed);
  }

  @Post('lessons/:id/progress')
  setLessonProgress(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: LessonProgressDto,
  ) {
    return this.progress.setLessonProgress(user.id, id, dto.completed);
  }

  @Post('courses/:slug/certificate')
  issue(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    return this.progress.issueCertificate(user.id, slug);
  }

  @Get('certificates/me')
  mine(@CurrentUser() user: AuthUser) {
    return this.progress.myCertificates(user.id);
  }

  /** Public verification: the whole point of the serial. Declared before :serial. */
  @Public()
  @Get('certificates/:serial/pdf')
  async pdf(@Param('serial') serial: string, @Res() res: Response) {
    const { bytes, fileName } = await this.progress.certificatePdf(serial);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(bytes);
  }

  @Public()
  @Get('certificates/:serial')
  verify(@Param('serial') serial: string) {
    return this.progress.verify(serial);
  }
}
