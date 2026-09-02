import { Controller, Get, Param, Post } from '@nestjs/common';
import { LibraryService } from './library.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';

/**
 * A reader's own library: what they saved, liked and downloaded.
 *
 * There is no enrolment here and no lesson progress. Courses are delivered as
 * Telegram archives, so there is nothing to be part-way through — the only
 * facts worth keeping are which courses someone marked and which they took.
 */
@Controller()
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get('me/learning')
  myLibrary(@CurrentUser() user: AuthUser) {
    return this.library.myLibrary(user.id);
  }

  @Post('courses/:id/save')
  save(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.library.saveCourse(user.id, id);
  }

  @Post('courses/:id/like')
  like(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.library.likeCourse(user.id, id);
  }
}
