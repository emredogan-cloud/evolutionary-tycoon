/**
 * Build identity, injected by Vite at build time (see vite.config.ts `define`).
 *
 * The SHA is the link between "what CI tested" and "what is live": the
 * preview-e2e workflow fetches /health.json from the deployed URL and asserts
 * this value equals the commit that triggered the build.
 */
export interface BuildInfo {
  readonly version: string;
  readonly buildSha: string;
  readonly buildShaShort: string;
  readonly builtAt: string;
  readonly isDev: boolean;
}

export const buildInfo: BuildInfo = {
  version: __APP_VERSION__,
  buildSha: __BUILD_SHA__,
  buildShaShort: __BUILD_SHA__.slice(0, 7),
  builtAt: __BUILT_AT__,
  isDev: __DEV_BUILD__,
};
