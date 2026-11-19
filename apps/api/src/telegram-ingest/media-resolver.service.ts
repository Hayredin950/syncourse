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

/** Bot API `getFile` gives out a path only for files up to 19 MB. */
const MIRROR_MAX_MB = 19;
/** Cloudinary's free raw bucket caps a single upload at 10 MB. */
const RAW_MAX_MB = 9.5;

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

  /** Resolve every photo in order; a failed one stays null rather than vanishing. */
  async resolveMany(images: Array<{ fileId: string }> = []): Promise<Array<string | null>> {
    const out: Array<string | null> = [];
    for (const image of images) out.push(await this.resolve(image.fileId));
    return out;
  }

  /**
   * Mirror a video, recording or document so the web page can serve it.
   *
   * The Bot API only hands out `file_path` for files up to 19 MB, so that is the
   * ceiling here; anything larger keeps its `file_id` and is delivered by the
   * bot on demand (a 149 MB podcast cannot be fetched by a hobby-function
   * through Telegram anyway). Cloudinary's free raw bucket stops at 10 MB, so
   * documents are held to that smaller line while video/audio get the full 19.
   *
   * Null is a normal outcome — publication must never wait on a mirror.
   */
  async resolveFile(file: {
    fileId: string;
    mimeType?: string | null;
    fileName?: string | null;
    fileSizeMb?: number | null;
  }): Promise<string | null> {
    const bucket = this.bucketFor(file.mimeType, file.fileName);
    if (!file.fileId || !bucket || !this.token || !this.cloudinary.enabled) return null;
    const declaredMb = file.fileSizeMb ?? 0;
    if (declaredMb > MIRROR_MAX_MB) return null;
    if (bucket.type === 'raw' && declaredMb > RAW_MAX_MB) return null;

    try {
      const info = await fetch(
        `https://api.telegram.org/bot${this.token}/getFile?file_id=${encodeURIComponent(file.fileId)}`,
      ).then(
        (r) =>
          r.json() as Promise<{
            ok: boolean;
            result?: { file_path?: string; file_size?: number };
            description?: string;
          }>,
      );
      if (!info.ok || !info.result?.file_path) {
        this.logger.warn(`getFile failed for ${file.fileName ?? file.fileId.slice(0, 12)}: ${info.description ?? 'no path'}`);
        return null;
      }
      const size = info.result.file_size ?? 0;
      if (size > MIRROR_MAX_MB * 1024 * 1024) return null;
      if (bucket.type === 'raw' && size > RAW_MAX_MB * 1024 * 1024) return null;

      const bytes = await fetch(`https://api.telegram.org/file/bot${this.token}/${info.result.file_path}`);
      if (!bytes.ok) {
        this.logger.warn(`file download failed: ${bytes.status}`);
        return null;
      }
      const buffer = Buffer.from(new Uint8Array(await bytes.arrayBuffer()));
      const mime = bytes.headers.get('content-type') ?? file.mimeType ?? 'application/octet-stream';
      const upload = await this.cloudinary.uploadFile(
        buffer,
        mime,
        bucket.folder,
        bucket.type,
        file.fileName,
      );
      return upload.url;
    } catch (err) {
      this.logger.error(`resolveFile ${file.fileName ?? file.fileId.slice(0, 12)}… failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Where a non-image attachment can live. Audio rides in Cloudinary's `video`
   * bucket because that is the one that serves playable media; documents go to
   * `raw`, which returns the original bytes instead of re-encoding them.
   */
  private bucketFor(
    mimeType?: string | null,
    fileName?: string | null,
  ): { type: 'video' | 'raw'; folder: string } | null {
    const mime = (mimeType ?? '').toLowerCase();
    const ext = (fileName ?? '').toLowerCase().split('.').pop() ?? '';
    if (mime.startsWith('video/') || mime.startsWith('audio/')) {
      return { type: 'video', folder: 'syncourse/resources' };
    }
    if (mime.startsWith('image/')) return null; // images go through resolve()
    if (mime === 'application/pdf' || ext === 'pdf' || ext === 'epub') {
      return { type: 'raw', folder: 'syncourse/documents' };
    }
    return null;
  }

  /** Resolve several roles at once, skipping the ones that were not posted. */
  async resolveRoles(
    images: Array<{ role: 'cover' | 'lecturer' | 'organization' | 'gallery'; fileId: string }> = [],
  ): Promise<Partial<Record<'cover' | 'lecturer' | 'organization', string>>> {
    const picked: Partial<Record<'cover' | 'lecturer' | 'organization', string>> = {};
    for (const image of images) {
      if (image.role === 'gallery') continue;
      const url = await this.resolve(image.fileId);
      if (url) picked[image.role] = url;
    }
    return picked;
  }
}
