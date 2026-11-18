import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './common/public.decorator';
import { PrismaService } from './prisma/prisma.service';

/**
 * Root + health endpoints.
 * The bare root previously returned "Cannot GET /" — it's now a friendly status
 * payload so uptime monitors (UptimeRobot etc.) have a real route to ping, and
 * visiting the API host in a browser shows something sensible instead of a 404.
 */
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  root() {
    return { status: 'ok', service: 'syncourse-api', docs: 'https://syncourse-web.vercel.app' };
  }

  /**
   * Reports the process *and* the database. The old check was static, so a
   * monitor stayed green while every real request failed on a dropped Neon
   * connection. A failed probe now returns 503.
   */
  @Public()
  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'syncourse-api',
        database: 'unreachable',
        now: new Date().toISOString(),
      });
    }
    return {
      status: 'ok',
      service: 'syncourse-api',
      database: 'ok',
      uptime: process.uptime(),
      now: new Date().toISOString(),
    };
  }
}
