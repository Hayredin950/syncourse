import { Body, Controller, Param, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { AdminService } from './admin.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';

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

  /** Staff-only. Attach a Cloudinary (or any https) image URL as the course cover. */
  @Post('courses/:slug/cover')
  updateCover(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: UpdateCoverDto) {
    return this.admin.updateCourseCover(user.id, slug, dto);
  }
}
