import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { IsBoolean, IsOptional } from 'class-validator';

class ProgressDto {
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

@Controller()
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Post('courses/:id/enroll')
  enroll(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.enrollment.enroll(user.id, id);
  }

  @Post('lessons/:id/progress')
  progress(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ProgressDto) {
    return this.enrollment.markLessonComplete(user.id, id, dto.completed ?? true);
  }

  @Get('me/learning')
  myLearning(@CurrentUser() user: AuthUser) {
    return this.enrollment.myLearning(user.id);
  }

  @Post('courses/:id/save')
  save(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.enrollment.saveCourse(user.id, id);
  }

  @Post('courses/:id/like')
  like(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.enrollment.likeCourse(user.id, id);
  }
}
