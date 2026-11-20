/**
 * Where the app actually lives.
 *
 * The footer used to say "Android · Windows · macOS" as plain text, which read
 * as a promise with nothing behind it. These are the exact asset names the
 * release workflow uploads, addressed through GitHub's `releases/latest`
 * redirect, so a link starts working the moment a release is published and
 * never needs a redeploy of the site.
 */
export const APP_REPO = "https://github.com/Hayredin950/syncourse";
export const APP_RELEASES = `${APP_REPO}/releases`;
export const APP_LATEST = `${APP_REPO}/releases/latest`;

export function releaseAsset(file: string): string {
  return `${APP_LATEST}/download/${file}`;
}

export interface AppBuild {
  id: string;
  os: string;
  detail: string;
  blurb: string;
  file: string;
  format: string;
  /** Secondary builds for the same OS (Intel Mac, ARM Linux). */
  alternates?: { label: string; file: string }[];
}

export const APP_BUILDS: AppBuild[] = [
  {
    id: "android",
    os: "Android",
    detail: "Android 7.0+",
    blurb: "Install the APK directly. Updates come from the same link; no store account needed.",
    file: "syncourse-android.apk",
    format: "APK",
  },
  {
    id: "windows",
    os: "Windows",
    detail: "Windows 10/11 · 64-bit",
    blurb: "Unzip anywhere and run syncourse.exe. No installer, no admin rights.",
    file: "syncourse-windows-x64.zip",
    format: "ZIP",
  },
  {
    id: "linux",
    os: "Linux",
    detail: "x86_64 · glibc",
    blurb: "Unpack the archive and run the binary inside. GTK 3 is the only system dependency.",
    file: "syncourse-linux-x64.tar.gz",
    format: "tar.gz",
  },
  {
    id: "macos",
    os: "macOS",
    detail: "Apple silicon · macOS 11+",
    blurb: "Open the disk image and drag Syncourse to Applications. Unsigned build: right-click → Open the first time.",
    file: "syncourse-macos-arm64.dmg",
    format: "DMG",
  },
];

/** The app is also a website; this one needs no build at all. */
export const APP_WEB_URL = "https://syncourse.pages.dev";
