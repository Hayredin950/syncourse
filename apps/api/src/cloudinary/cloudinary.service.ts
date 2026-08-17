import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export interface CloudinaryUpload {
  url: string;
  publicId: string;
}

/**
 * Cloudinary integration (images only — course covers, lecturer avatars,
 * note images). Video intentionally stays on R2, never Cloudinary.
 *
 * Pure `fetch` implementation — no SDK dependency. Every method degrades
 * gracefully: URL building falls back to the original URL and uploads throw
 * a clear error when the CLOUDINARY_* env vars are not configured.
 */
@Injectable()
export class CloudinaryService {
  private readonly cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME') ?? '';
  private readonly apiKey = this.config.get<string>('CLOUDINARY_API_KEY') ?? '';
  private readonly apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET') ?? '';

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.cloudName && this.apiKey && this.apiSecret);
  }

  /**
   * Build an optimized delivery URL.
   * - For remote URLs: Cloudinary "fetch" mode transforms the image on the fly.
   * - For public ids: standard delivery with the same transforms.
   * - When Cloudinary isn't configured: returns the input untouched.
   */
  url(input: string, opts: { width?: number; height?: number } = {}): string {
    if (!this.cloudName) return input;
    if (input.includes('res.cloudinary.com')) return input;

    const parts: string[] = ['f_auto', 'q_auto'];
    if (opts.width) parts.push(`w_${opts.width}`);
    if (opts.height) parts.push(`h_${opts.height}`);
    if (opts.width || opts.height) parts.push('c_fill');
    const transforms = parts.join(',');

    if (/^https?:\/\//.test(input)) {
      return `https://res.cloudinary.com/${this.cloudName}/image/fetch/${transforms}/${encodeURIComponent(input)}`;
    }
    return `https://res.cloudinary.com/${this.cloudName}/image/upload/${transforms}/${input}`;
  }

  /** Upload a raw image buffer (signed request). */
  async uploadBuffer(buffer: Buffer, mime: string, folder = 'syncourse'): Promise<CloudinaryUpload> {
    if (!this.enabled) {
      throw new Error('Cloudinary is not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET');
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const params: Record<string, string> = { timestamp, folder };
    const toSign =
      Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&') + this.apiSecret;
    const signature = createHash('sha1').update(toSign).digest('hex');

    const ext = (mime.split('/')[1] ?? 'png').split(';')[0] || 'png';
    const form = new FormData();
    form.append('file', new Blob([buffer as unknown as BlobPart], { type: mime }), `upload-${timestamp}.${ext}`);
    form.append('cloud_name', this.cloudName);
    form.append('api_key', this.apiKey);
    form.append('folder', folder);
    form.append('timestamp', timestamp);
    form.append('signature', signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cloudinary upload failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as { secure_url: string; public_id: string };
    return { url: json.secure_url, publicId: json.public_id };
  }

  /** Upload from a base64 data URL (e.g. a client-side file picker). */
  async uploadDataUrl(dataUrl: string, folder = 'syncourse'): Promise<CloudinaryUpload> {
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
    if (!match) throw new Error('Expected a base64 data URL (data:image/...;base64,...)');
    const buffer = Buffer.from(match[2], 'base64');
    return this.uploadBuffer(buffer, match[1], folder);
  }

  /** Upload an image by fetching it from a remote URL (mirrors to Cloudinary). */
  async uploadFromUrl(imageUrl: string, folder = 'syncourse'): Promise<CloudinaryUpload> {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${imageUrl}`);
    const buffer = Buffer.from(new Uint8Array(await res.arrayBuffer()));
    const mime = res.headers.get('content-type') ?? 'image/jpeg';
    return this.uploadBuffer(buffer, mime, folder);
  }
}
