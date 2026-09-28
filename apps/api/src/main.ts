import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

/**
 * Browser origins allowed to call this API.
 *
 * This used to be `origin: true`, which reflected whatever Origin asked for
 * *and* set `credentials: true` — so any site could read authenticated
 * responses. Bearer tokens make that hard to exploit (a browser never attaches
 * them on its own), but there is no reason to hand out the permission.
 *
 * Callers with no Origin at all — the React Native app, curl, Telegram's
 * webhook, server-to-server jobs — are unaffected by this list.
 */
function allowedOrigins(): string[] {
  return [
    process.env.PUBLIC_APP_URL,
    // the Vercel deployments, and the Cloudflare Pages fallback still in service
    'https://syncourse-web.vercel.app',
    'https://syncourse.pages.dev',
    // local dev: Next on 3000, Expo web on 8081
    'http://localhost:3000',
    'http://localhost:8081',
    // escape hatch for extra hosts without a redeploy of this file
    ...(process.env.CORS_ORIGINS ?? '').split(','),
  ]
    .map((origin) => origin?.trim())
    .filter((origin): origin is string => Boolean(origin));
}

/** `syncourse-web-<hash>-<team>.vercel.app` — preview builds of the web app. */
const PREVIEW_ORIGIN = /^https:\/\/syncourse-web-[a-z0-9]+-[a-z0-9-]+\.vercel\.app$/;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Images are uploaded as base64 data URLs — the default 100kb body limit
  // rejected them with "request entity too large". 15mb covers photos/banners.
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));
  app.setGlobalPrefix('api');
  app.enableCors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      callback(null, allowedOrigins().includes(origin) || PREVIEW_ORIGIN.test(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  // Baseline headers for a JSON API. TLS is terminated at Vercel's edge, so
  // HSTS is safe to send from here. The CSP is deliberately directive-only
  // (`frame-ancestors`/`default-src`) because this app never returns HTML —
  // there is no inline script to allow.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  // Vercel injects PORT and supervises the listener; API_PORT stays the local
  // default so `npm run start:dev` keeps working unchanged.
  const port = Number(process.env.PORT || process.env.API_PORT || 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Syncourse API listening on http://localhost:${port}/api`);
}
bootstrap();
