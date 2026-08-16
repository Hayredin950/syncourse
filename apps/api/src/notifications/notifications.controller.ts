import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/jwt-auth.guard';
import { IsOptional, IsString } from 'class-validator';

class NotifyDto {
  @IsString()
  type: string;

  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsString()
  deepLink?: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @Post('read')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markRead(user.id);
  }

  @Post('read/:id')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(user.id, id);
  }

  /** Demo/telegram-reminder trigger — e.g. "class starts in 1 hour". */
  @Post('send')
  send(@CurrentUser() user: AuthUser, @Body() dto: NotifyDto) {
    return this.notifications.notify(user.id, dto);
  }
}
