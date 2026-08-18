import type { Header, HeaderRule, Rewrite, VercelConfig } from '@vercel/config/v1';

/**
 * Deployment configuration, authored in TypeScript and compiled to vercel.json
 * by `pnpm config:build` (see package.json). The compiled vercel.json is
 * committed and CI asserts the two are in sync, so the platform always reads a
 * plain JSON file — no runtime dependency on TypeScript config support.
 *
 * Everything here is verified by tests/e2e/headers.spec.ts running against the
 * real deployed URL. A passing local build proves nothing about what the CDN
 * actually serves.
 */

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Svelte emits component styles as inline <style> elements, so styles need
  // 'unsafe-inline'. Scripts stay strictly 'self', which is where the real XSS
  // risk lives. Revisit in Phase 21 to see if a nonce-based style policy is
  // workable by then.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS: Header[] = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const NO_CACHE: Header[] = [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }];
const NO_STORE: Header[] = [{ key: 'Cache-Control', value: 'no-store, max-age=0' }];

const headers: HeaderRule[] = [
  // Security headers everywhere.
  { source: '/(.*)', headers: SECURITY_HEADERS },

  // Content-hashed build output. Safe to cache forever precisely because the
  // filename changes whenever the bytes do (vite.config.ts rollupOptions).
  // This is also a cost control: Vercel Hobby allows 100 GB/month, and repeat
  // visitors must not re-download the bundle (docs/RESEARCH_NOTES.md §9).
  {
    source: '/assets/(.*)',
    headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
  },

  // The entry document and the health probe must never be cached, or a fresh
  // deployment would appear not to have happened.
  { source: '/', headers: NO_CACHE },
  { source: '/index.html', headers: NO_CACHE },
  { source: '/health.json', headers: NO_STORE },
];

const rewrites: Rewrite[] = [
  // SPA fallback. Anything that is not a function, a build asset, or one of the
  // known root files renders the app shell.
  {
    source: '/((?!api/|assets/|atlas/|health\\.json|favicon\\.svg).*)',
    destination: '/index.html',
  },
];

const config: VercelConfig = {
  framework: 'vite',
  buildCommand: 'pnpm assets:build && pnpm build',
  installCommand: 'pnpm install --frozen-lockfile',
  outputDirectory: 'dist',
  headers,
  rewrites,
};

export default config;
