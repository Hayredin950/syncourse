/**
 * Fallback display names for the documents the apps link to directly. A document
 * can override its heading with LegalDocument.title; these exist so a freshly
 * created row still reads as something other than its slug.
 */
export const LEGAL_TITLES: Record<string, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  refund: 'Refund Policy',
};

export function legalTitle(type: string, title?: string | null): string {
  return title?.trim() || LEGAL_TITLES[type] || type;
}

/**
 * Next version for a republished document: bump the trailing number, so 1.0
 * becomes 1.1 and 2.9 becomes 2.10. Admins can always type a version instead —
 * this is only the default when they change the text and leave the field alone.
 */
export function bumpVersion(current: string): string {
  const parts = (current || '1.0').trim().split('.');
  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last)) {
    parts[parts.length - 1] = String(Number(last) + 1);
    return parts.join('.');
  }
  return `${current}.1`;
}
