import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
// Explicit extension: Vite's native config loader cannot resolve extensionless
// relative imports, and it is planned to become the default.
import { SAVE_SCHEMA_VERSION } from './src/config/simulation.ts';

/**
 * Resolve the current commit SHA at build time.
 *
 * This value is baked into the bundle and served from /health.json so that a
 * deployment can be proven to contain the code we think it contains. CI asserts
 * that /health.json on the live preview URL matches the commit that triggered
 * the build — without this, "deployed successfully" only means Vercel accepted
 * an upload, not that the right artefact is live.
 */
function resolveBuildSha(): string {
  // Vercel and GitHub Actions both expose the SHA; prefer those over invoking git,
  // because the build container may not have a full git history.
  const fromEnv = process.env['VERCEL_GIT_COMMIT_SHA'] ?? process.env['GITHUB_SHA'];
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;

  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

/** Emit /health.json alongside the build output. */
function healthEndpointPlugin(buildSha: string, builtAt: string): Plugin {
  return {
    name: 'evotycoon:health-endpoint',
    apply: 'build',
    generateBundle(_options, _bundle) {
      const health = {
        version: pkg.version,
        buildSha,
        builtAt,
        // Populated once the asset pipeline exists (Phase 4). Explicitly null now
        // rather than absent, so consumers can distinguish "no pipeline yet" from
        // "pipeline ran and produced nothing".
        assetManifestHash: null,
        // Read from the source of truth rather than restated here. A health
        // endpoint that reports a schema version the build does not actually
        // write turns the deployment assertion into theatre.
        schemaVersion: SAVE_SCHEMA_VERSION,
      };
      this.emitFile({
        type: 'asset',
        fileName: 'health.json',
        source: JSON.stringify(health, null, 2) + '\n',
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const buildSha = resolveBuildSha();
  const builtAt = new Date().toISOString();

  return {
    plugins: [
      svelte(),
      healthEndpointPlugin(buildSha, builtAt),
      /*
       * The service worker — Phase 14, approved stack (TECHNICAL_ARCHITECTURE
       * §3: vite-plugin-pwa 1.3.0). generateSW with the workbox runtime
       * inlined, so the emitted sw.js is one self-contained same-origin file
       * and the CSP stays `script-src 'self'` with nothing added.
       *
       * Registration is manual (src/app/registerServiceWorker.ts) —
       * `injectRegister: null` keeps library code out of the runtime bundle.
       */
      VitePWA({
        injectRegister: null,
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Evolutionary Tycoon',
          short_name: 'EvoTycoon',
          description:
            'Yol kenarındaki minicik bir tezgâhı, önünden akan trafiği müşteriye çevirerek bir restoran imparatorluğuna dönüştür.',
          lang: 'tr',
          start_url: '/',
          display: 'standalone',
          background_color: '#12161d',
          theme_color: '#12161d',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          inlineWorkboxRuntime: true,
          sourcemap: false,
          /*
           * Everything static is precached with a content revision — the
           * hashed bundle, the atlases, the ground bake, the icons. This is
           * the "second visit ~0 bandwidth" requirement, which is a Vercel
           * cost constraint (100 GB/month) before it is a performance one.
           */
          globPatterns: ['**/*.{js,css,html,svg,png,webp,json,webmanifest}'],
          globIgnores: [
            /*
             * health.json is the deployment's identity probe — serving it from
             * a cache would make "which build is live" unanswerable, which is
             * exactly the question it exists to answer. It is also no-store on
             * the CDN for the same reason.
             */
            '**/health.json',
            // Vite emits sourcemaps beside the bundle; nobody replays offline.
            '**/*.map',
          ],
          /*
           * ~5 MB of atlases is the point of the exercise; the default 2 MB
           * cap would silently drop the biggest wins. The bundle's own budget
           * is enforced by size-limit, not here.
           */
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [
            // The one real function, and the identity probe.
            /^\/api\//,
            /^\/health\.json$/,
          ],
          /*
           * No runtimeCaching entries, deliberately. Anything not precached —
           * /api/time above all — goes straight to the network; a cached Date
           * header is a stale Date header.
           */
        },
      }),
    ],

    resolve: {
      alias: {
        '@app': resolve(import.meta.dirname, 'src/app'),
        '@sim': resolve(import.meta.dirname, 'src/sim'),
        '@render': resolve(import.meta.dirname, 'src/render'),
        '@ui': resolve(import.meta.dirname, 'src/ui'),
        '@config': resolve(import.meta.dirname, 'src/config'),
        '@persistence': resolve(import.meta.dirname, 'src/persistence'),
        '@platform': resolve(import.meta.dirname, 'src/platform'),
      },
    },

    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_SHA__: JSON.stringify(buildSha),
      __BUILT_AT__: JSON.stringify(builtAt),
      __DEV_BUILD__: JSON.stringify(command === 'serve'),
    },

    build: {
      target: 'es2022',
      sourcemap: true,
      // Raw-size tripwire, above the ~1.5 MB Phaser legitimately contributes.
      //
      // The authoritative budget is size-limit on the *gzipped* bundle (550 kB),
      // which is what a player actually downloads. Leaving this at 700 kB would
      // warn on every single build from Phase 3 onward, and a warning that is
      // always on is a warning nobody reads. Set just above today's measured
      // size so real growth still trips it. Phase 14 tripped it legitimately
      // (offline flow + report screen, 1717 kB raw / 466 kB gzip) and it moves
      // up the same margin it was given before.
      chunkSizeWarningLimit: 1750,
      rollupOptions: {
        output: {
          // Content hashing is what makes the immutable cache header in vercel.ts safe.
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
        },
      },
    },

    server: {
      port: 5173,
      strictPort: true,
    },

    preview: {
      port: 4173,
      strictPort: true,
      // Explicit loopback binding. Inside the Playwright CI container the
      // default `localhost` resolution did not match the address Playwright
      // polls, and the webServer wait timed out with no diagnostic.
      host: '127.0.0.1',
    },
  };
});
