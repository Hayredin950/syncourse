import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, limit = 50) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return {
      unread: rows.filter((n) => !n.read).length,
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        deepLink: n.deepLink,
        read: n.read,
        createdAt: n.createdAt,
      })),
    };
  }

  async markRead(userId: string, notificationId?: string) {
    if (notificationId) {
      await this.prisma.notification.updateMany({
        where: { id: notificationId, userId },
        data: { read: true },
      });
    } else {
      await this.prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
      });
    }
    return { updated: true };
  }

  /**
   * Push a reminder to a user — sends via the Telegram bot when the user has
   * linked an account and TELEGRAM_BOT_TOKEN is configured, and always stores
   * an in-app notification. Fails soft when Telegram isn't configured.
   */
  async notify(
    userId: string,
    input: { type: string; title: string; body: string; deepLink?: string },
  ) {
    const stored = await this.prisma.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        deepLink: input.deepLink ?? null,
      },
    });

    const telegramSent = await this.sendViaTelegram(userId, `${input.title}\n${input.body}`);
    return { id: stored.id, telegramSent };
  }

  /** Send an arbitrary message to a user's linked Telegram chat (if linked). */
  async sendViaTelegram(userId: string, text: string): Promise<boolean> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return false;
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user?.telegramId) return false;
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: String(user.telegramId),
          text,
          disable_web_page_preview: true,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Admin helper: broadcast to users who opted in (linked Telegram). */
  async broadcast(input: { type: string; title: string; body: string; deepLink?: string }) {
    const users = await this.prisma.user.findMany({
      where: { telegramUsername: { not: null } },
      select: { id: true },
      take: 500,
    });
    const created = await this.prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: input.type,
        title: input.title,
        body: input.body,
        deepLink: input.deepLink ?? null,
      })),
    });
    return { created: created.count };
  }
}
