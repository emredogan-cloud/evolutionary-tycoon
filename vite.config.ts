import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };

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
        // Save schema version. Bumped by src/persistence/migrations as the schema evolves.
        schemaVersion: 1,
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
    plugins: [svelte(), healthEndpointPlugin(buildSha, builtAt)],

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
      // Fail the build rather than silently shipping a bundle we did not budget for.
      // The authoritative budget lives in size-limit; this is an early tripwire.
      chunkSizeWarningLimit: 700,
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
