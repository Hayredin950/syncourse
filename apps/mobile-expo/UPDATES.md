# Over-the-air updates (EAS Update)

The app ships with an **auto-update check** (PhonoFilm-style): on launch and
every time the app returns to the foreground it compares the installed build
version against the latest published version from the API
(`GET /api/app-versions`). When a newer version exists it shows an
"Update available — vX.Y.Z" banner with an **Update** button.

The Update button tries two paths, in order:

1. **OTA via EAS Update** — downloads and reloads the JS bundle in place
   (no new APK). This is the "auto update" path.
2. **Fallback** — if no OTA update is available (e.g. the change requires a
   native rebuild), it opens the EAS builds page so the user can install the
   new APK.

## Why the old 1.0.0 build can't OTA

OTA requires the app binary to embed `expo-updates` (added in this repo) and
point at an EAS Update channel. The 1.0.0 APK was built before that, so on
that build the Update button falls back to the builds page. **A new build is
required once** — after that, updates are pure OTA.

## How to publish an update

```bash
cd apps/mobile-expo

# 1. (Optional) Bump the version + runtimeVersion together in app.json
#    — e.g. "version": "1.2.0", "runtimeVersion": "1.2.0"

# 2. Publish the JS bundle to the channel the app was built with
npx eas update --channel preview --message "fix: player crash on Android"

# 3. (Optional) Seed the new version on the backend so the update banner
#    fires for older installs — add an AppVersion row:
#    version "1.2.0", changelogMd "…", releasedAt now
#    (see apps/api/prisma/seed-rich.ts for the pattern; re-run the seed
#    or insert the row in Neon directly)
```

The build profile in `eas.json` pins the channel: `preview` builds get the
`preview` channel, `production` builds get `production`. Only publish to the
channel your installed builds are on.

## Version rules (keep these in sync)

| Where | Value |
| --- | --- |
| `app.json` → `version` | Installed version the update banner compares against |
| `app.json` → `runtimeVersion` | Must match what `eas update` publishes (appVersion policy) |
| API `AppVersion.version` | The "latest" the banner compares to — must be **higher** than installed |

If the API latest ≤ installed version, no banner shows. So after shipping a
new build, seed a *newer* API version before it's widely installed, or the
banner just won't appear until the next release.
