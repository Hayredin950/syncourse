import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as Updates from "expo-updates";
import { appVersions } from "./api";
import type { AppVersion } from "./types";

/** Where users land when no OTA update is available (native change → new build). */
export const UPDATE_URL =
  "https://expo.dev/accounts/hayrecodes-team/projects/syncourse/builds";

/** Semver compare — returns 1 if a > b, -1 if a < b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a ?? "")
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b ?? "")
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** The version baked into this build. */
export function getInstalledVersion(): string {
  return (
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    "1.0.0"
  );
}

/**
 * Latest published version from the backend (newest first).
 * Returns null when the API is unreachable — callers treat that as "no update".
 */
export async function getLatestVersion(): Promise<AppVersion | null> {
  try {
    const versions = await appVersions();
    return versions && versions.length > 0 ? versions[0] : null;
  } catch {
    return null;
  }
}

export interface UpdateInfo {
  installed: string;
  latest: AppVersion | null;
  updateAvailable: boolean;
}

export async function getUpdateInfo(): Promise<UpdateInfo> {
  const installed = getInstalledVersion();
  const latest = await getLatestVersion();
  const updateAvailable =
    !!latest && compareVersions(latest.version, installed) > 0;
  return { installed, latest, updateAvailable };
}

/**
 * Try to apply the update:
 * 1. OTA via EAS Update (fetch + reload) — the "auto update" path.
 * 2. Fallback: open the EAS builds page so the user can grab the new build.
 * Returns which path was taken.
 */
export async function applyUpdate(): Promise<"ota" | "url"> {
  try {
    if (Updates.isEnabled) {
      const check = await Updates.checkForUpdateAsync();
      if (check.isAvailable) {
        const fetch = await Updates.fetchUpdateAsync();
        if (fetch.isNew) {
          await Updates.reloadAsync();
          return "ota";
        }
      }
    }
  } catch {
    // OTA not configured on this build (e.g. built before expo-updates) — fall through.
  }
  await Linking.openURL(UPDATE_URL);
  return "url";
}
