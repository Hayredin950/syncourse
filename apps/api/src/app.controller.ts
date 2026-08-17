import { Controller, Get } from '@nestjs/common';
import { Public } from './common/public.decorator';

/**
 * Root + health endpoints.
 * The bare root previously returned "Cannot GET /" — it's now a friendly status
 * payload so uptime monitors (UptimeRobot etc.) have a real route to ping, and
 * visiting the API host in a browser shows something sensible instead of a 404.
 */
@Controller()
export class AppController {
  @Public()
  @Get()
  root() {
    return { status: 'ok', service: 'syncourse-api', docs: 'https://syncourse.pages.dev' };
  }

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'syncourse-api', uptime: process.uptime(), now: new Date().toISOString() };
  }
}
