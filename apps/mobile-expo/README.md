# 📱 SynCourse Mobile — Expo / React Native

The React Native client (Expo SDK 57), built alongside the Flutter client in
`apps/mobile/`. Same design tokens and the same NestJS API — this app is
TypeScript end-to-end (NestJS API + Next.js web + this app), sharing the API
contract via `lib/types.ts`.

## Run it

```bash
# from the repo root (monorepo — installs the workspace deps)
npm install -w apps/mobile-expo

# point the app at your API (defaults to http://localhost:4000)
export EXPO_PUBLIC_API_URL=http://localhost:4000

cd apps/mobile-expo
npx expo start          # scan the QR with Expo Go, or press a / i for a simulator
```

For a physical device, `EXPO_PUBLIC_API_URL` must be your machine's LAN IP
(e.g. `http://192.168.1.10:4000`), not `localhost`.

## What's implemented

Expo Router file-based navigation — 5-tab bottom nav + stack screens:

| Screen | Route | Notes |
|---|---|---|
| Home | `(tabs)/index` | Trending / Latest / Top rated rails + Best-of + Featured paths |
| Browse | `(tabs)/browse` | Sortable course list (top-rated / most-downloaded / A–Z) |
| Search | `(tabs)/search` | Live search + "Everyone is searching" trending chips |
| Learning | `(tabs)/learning` | In progress / Completed / Wishlist / Liked with progress bars |
| Me | `(tabs)/me` | Stat grid, premium badge, lists / subscription / circles, sign out |
| Course detail | `courses/[slug]` | Banner, meta, tags, curriculum → lessons, reviews, downloads widget |
| Lesson | `courses/[slug]/lessons/[lessonId]` | expo-video player (signed URL), mark complete, files, notes |
| Auth | `auth` | Email/password login + register (JWT via AsyncStorage) |
| Premium | `premium` | ETB plans + benefit rows (reader-app pattern: pay on web) |
| Lists | `lists` + `lists/[id]` | Create lists, public/private, contents |
| Circles | `circles` | Social activity feed |

## Stack notes

- **Data fetching** — TanStack React Query (same as the web app).
- **Auth** — bearer token in AsyncStorage via `lib/auth.tsx` context.
- **Styling** — plain RN StyleSheet driven by `lib/tokens.ts`, which mirrors
  `packages/design-tokens` exactly (near-black `#0E0E10` bg, amber `#F5A524`
  accent). No NativeWind dependency keeps the install lean.
- **Payments** — reader-app pattern (App Store / Play Store compliant): the
  app only checks subscription entitlement; checkout lives on the web app.
  `lib/api.ts` already has the `checkout` call wired for the web fallback.
- **Video** — `expo-video` + the API's signed-URL endpoint (`/lessons/:id/video-url`).

## Structure

```
app/                    # expo-router file-based routes
  (tabs)/               # bottom tab navigator
  courses/[slug]/       # course detail + lessons
  auth.tsx premium.tsx circles.tsx lists/
components/             # CourseCard, Rail, Stars
lib/
  api.ts                # API client (mirrors apps/web/src/lib/api.ts)
  auth.tsx              # auth context (token + profile)
  tokens.ts             # design tokens (mirrors packages/design-tokens)
  types.ts              # API types (mirrors the NestJS responses)
  theme.ts              # shared dark-theme styles
```
