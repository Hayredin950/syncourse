import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { IsOptional, IsString } from 'class-validator';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  settings?: Record<string, unknown>;

  @IsOptional()
  privacy?: Record<string, string>;
}

class ChangePasswordDto {
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  newPassword!: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.profile(user.id);
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Get('me/stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.users.stats(user.id);
  }

  @Post('me/unlink-google')
  unlinkGoogle(@CurrentUser() user: AuthUser) {
    return this.users.unlinkGoogle(user.id);
  }

  @Post(':id/follow')
  toggleFollow(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.toggleFollow(user.id, id);
  }

  @Get('me/following')
  following(@CurrentUser() user: AuthUser) {
    return this.users.following(user.id);
  }

  @Post('me/change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Post('sessions/:id/terminate')
  terminate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.terminateSession(user.id, id);
  }

  @Post('sessions/terminate-all')
  terminateAll(@CurrentUser() user: AuthUser) {
    return this.users.terminateAllSessions(user.id);
  }
}
