import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export interface CloudinaryUpload {
  url: string;
  publicId: string;
}

/** What the browser needs to POST a file straight to Cloudinary. */
export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: string;
  folder: string;
  signature: string;
  /** Cloudinary's own bucket for the file — part of the URL, never signed. */
  resourceType: 'image' | 'video' | 'auto';
  uploadUrl: string;
}

/** Which Cloudinary bucket each kind of authoring upload belongs in. */
const KINDS = {
  image: { resourceType: 'image', folder: 'syncourse' },
  video: { resourceType: 'video', folder: 'syncourse/videos' },
  // `auto` lets Cloudinary sort a mixed bag: an mp4 dropped into the
  // attachment field still lands as a video, a ZIP lands as `raw`.
  file: { resourceType: 'auto', folder: 'syncourse/files' },
} as const;

export type UploadKind = keyof typeof KINDS;

/** Avatars/covers are small images; anything near this is not a cover any more. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Ranges a user-supplied image URL must never reach. The API fetches the URL
 * from the server, so without this a signed-in caller could ask it to read
 * cloud metadata (169.254.169.254) or an internal service and receive the
 * response back as a Cloudinary URL.
 */
const BLOCKED_V4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED_V4.addSubnet(network, prefix, 'ipv4');
}
const BLOCKED_V6 = new BlockList();
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED_V6.addSubnet(network, prefix, 'ipv6');
}

/**
 * Cloudinary integration — course covers, banners, lecturer avatars, note
 * images, and (via signed direct upload) short videos and lesson attachments.
 *
 * Two upload paths, deliberately:
 * - `uploadDataUrl`/`uploadBuffer` push bytes through this API. Simple, and
 *   fine for avatars, but Express caps the JSON body at 15 MB and base64
 *   inflates by a third, so the real ceiling is ~11 MB.
 * - `signUpload` hands the browser a signature and gets out of the way, so the
 *   file goes straight to Cloudinary. No body limit, no Render bandwidth, and
 *   upload progress the client can actually report.
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

  /**
   * Sign an upload the browser will perform itself.
   *
   * Cloudinary signs the timestamp plus every optional parameter sent with the
   * file; `api_key`, `cloud_name`, `resource_type` and `file` are excluded. The
   * signature is good for an hour, so a slow upload on a bad connection still
   * lands.
   */
  signUpload(kind: UploadKind = 'image'): UploadSignature {
    if (!this.enabled) {
      throw new Error(
        'Cloudinary is not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET',
      );
    }
    const { resourceType, folder } = KINDS[kind] ?? KINDS.image;
    const timestamp = String(Math.floor(Date.now() / 1000));
    return {
      cloudName: this.cloudName,
      apiKey: this.apiKey,
      timestamp,
      folder,
      signature: this.sign({ folder, timestamp }),
      resourceType,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`,
    };
  }

  /** SHA-1 of the alphabetically sorted params plus the API secret. */
  private sign(params: Record<string, string>): string {
    const toSign =
      Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&') + this.apiSecret;
    return createHash('sha1').update(toSign).digest('hex');
  }

  /** Upload a raw image buffer (signed request). */
  async uploadBuffer(buffer: Buffer, mime: string, folder = 'syncourse'): Promise<CloudinaryUpload> {
    if (!this.enabled) {
      throw new Error('Cloudinary is not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET');
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = this.sign({ folder, timestamp });

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
    if (!match[1].startsWith('image/')) throw new Error('Only image uploads are supported here');
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image is too large');
    return this.uploadBuffer(buffer, match[1], folder);
  }

  /**
   * Upload an image by fetching it from a remote URL (mirrors to Cloudinary).
   *
   * This is a server-side fetch of a caller-supplied URL, so it validates the
   * scheme, resolves the host, and refuses private/link-local/mapped addresses.
   * Redirects are not followed: a public URL that 302s to 169.254.169.254 would
   * otherwise slip past the check.
   */
  async uploadFromUrl(imageUrl: string, folder = 'syncourse'): Promise<CloudinaryUpload> {
    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch {
      throw new Error('That is not a valid URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only http(s) image URLs are supported');
    }
    if (url.username || url.password) throw new Error('Image URLs must not contain credentials');

    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host)
      ? [host]
      : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
    if (addresses.length === 0 || addresses.some((address) => this.isBlockedAddress(address))) {
      throw new Error('That URL points to a private or unresolvable address');
    }

    const res = await fetch(url, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      throw new Error('Image URLs that redirect are not supported');
    }
    if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);

    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!mime.startsWith('image/')) throw new Error('That URL did not return an image');

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_IMAGE_BYTES) throw new Error('Image is too large');

    const buffer = Buffer.from(new Uint8Array(await res.arrayBuffer()));
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image is too large');
    return this.uploadBuffer(buffer, mime, folder);
  }

  /** True for loopback, private, link-local, multicast and IPv4-mapped equivalents. */
  private isBlockedAddress(address: string): boolean {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    const ip = mapped ? mapped[1] : address;
    const family = isIP(ip);
    if (family === 4) return BLOCKED_V4.check(ip, 'ipv4');
    if (family === 6) return BLOCKED_V6.check(ip, 'ipv6');
    return true;
  }
}
