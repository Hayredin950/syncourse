import { createHmac } from 'crypto';

/**
 * Issuance of short-lived signed media URLs.
 * Pattern from the spec: Client → API → checks entitlement → returns a
 * signed URL (default 15 min) → client streams from storage/CDN directly.
 * Never return a permanent public storage link.
 */
const DEFAULT_TTL_SECONDS = 15 * 60;

export interface SignedUrl {
  url: string;
  expiresAt: string; // ISO
}

/** Last path segment of a media URL — used as the download filename. */
export function fileNameFromUrl(rawUrl: string): string {
  try {
    const path = new URL(rawUrl).pathname;
    const name = decodeURIComponent(path.split('/').pop() ?? '').trim();
    return name || 'download';
  } catch {
    return 'download';
  }
}

export function signMediaUrl(rawUrl: string, secret: string, ttlSeconds = DEFAULT_TTL_SECONDS): SignedUrl {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = createHmac('sha256', secret)
    .update(`${rawUrl}:${expires}`)
    .digest('hex');
  const sep = rawUrl.includes('?') ? '&' : '?';
  const url = `${rawUrl}${sep}expires=${expires}&sig=${signature}`;
  return { url, expiresAt: new Date(expires * 1000).toISOString() };
}

/**
 * Check a signed URL at the point that serves the bytes.
 *
 * This API only *issues* the signed URL; storage/CDN must call this (or its
 * equivalent) before handing the file over. Today files are served straight
 * from Telegram/Cloudinary, so the parameters travel with the URL but nothing
 * checks them — a deployment that needs enforcement has to put its own proxy
 * or CDN rule in front and verify there.
 */
export function verifySignedUrl(rawUrl: string, secret: string, urlWithParams: string): boolean {
  try {
    const u = new URL(urlWithParams);
    const expires = Number(u.searchParams.get('expires'));
    const sig = u.searchParams.get('sig') ?? '';
    if (!expires || expires < Math.floor(Date.now() / 1000)) return false;
    const expected = createHmac('sha256', secret)
      .update(`${rawUrl}:${expires}`)
      .digest('hex');
    return expected === sig;
  } catch {
    return false;
  }
}
