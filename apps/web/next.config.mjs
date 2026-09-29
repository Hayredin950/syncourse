/**
 * Static export is opt-in, not the default.
 *
 * Vercel builds this app as an ordinary Next.js server, which is what makes
 * content added between deploys work: a lecturer, course or resource created in
 * the admin console (or by the Telegram bot) has no pre-built HTML file, so a
 * frozen route set answered every new deep link with a 404.
 *
 * Cloudflare Pages still needs the exported bundle — its deploy script sets
 * STATIC_EXPORT=1 and uploads `out/`. In that mode `app/not-found.tsx` is the
 * fallback that revives detail URLs created since the last build.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  ...(process.env.STATIC_EXPORT === "1" ? { output: "export" } : {}),
  images: { unoptimized: true },
};

export default nextConfig;
