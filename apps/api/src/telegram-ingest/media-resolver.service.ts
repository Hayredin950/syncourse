/**
 * media-resolver.service.ts
 *
 * Telegram `file_id`s are only usable by the bot that received them, so an
 * image sent with a course post cannot be rendered by the web app directly.
 * This mirrors the bytes to Cloudinary once and returns a public URL.
 *
 * It lives outside `TelegramService` because approval can be triggered from
 * two places — the bot's Create button and the admin console — and the second
 * one has no bot instance to borrow the helper from.
 */
import { Injectable, Logger } from '@nestjs/common';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class TelegramMediaResolver {
  private readonly logger = new Logger('TelegramMedia');

  constructor(private readonly cloudinary: CloudinaryService) {}

  private get token(): string {
    return (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  }

  /**
   * Public URL for a Telegram photo, or null when it cannot be mirrored.
   *
   * Returning null rather than throwing is deliberate: a missing cover must
   * never stop the course from being published, because the files are the
   * product and the image is decoration.
   */
  async resolve(fileId: string): Promise<string | null> {
    if (!fileId || !this.token || !this.cloudinary.enabled) return null;
    try {
      const info = await fetch(
        `https://api.telegram.org/bot${this.token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      ).then((r) => r.json() as Promise<{ ok: boolean; result?: { file_path?: string }; description?: string }>);
      if (!info.ok || !info.result?.file_path) {
        this.logger.warn(`getFile failed: ${info.description ?? 'no path'}`);
        return null;
      }

      const bytes = await fetch(`https://api.telegram.org/file/bot${this.token}/${info.result.file_path}`);
      if (!bytes.ok) {
        this.logger.warn(`file download failed: ${bytes.status}`);
        return null;
      }

      const buffer = Buffer.from(new Uint8Array(await bytes.arrayBuffer()));
      const mime = bytes.headers.get('content-type') ?? 'image/jpeg';
      const upload = await this.cloudinary.uploadBuffer(buffer, mime, 'covers');
      return upload.url;
    } catch (err) {
      this.logger.error(`resolve ${fileId.slice(0, 12)}… failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** Resolve several roles at once, skipping the ones that were not posted. */
  async resolveRoles(
    images: Array<{ role: 'cover' | 'lecturer' | 'organization'; fileId: string }> = [],
  ): Promise<Partial<Record<'cover' | 'lecturer' | 'organization', string>>> {
    const picked: Partial<Record<'cover' | 'lecturer' | 'organization', string>> = {};
    for (const image of images) {
      const url = await this.resolve(image.fileId);
      if (url) picked[image.role] = url;
    }
    return picked;
  }
}
