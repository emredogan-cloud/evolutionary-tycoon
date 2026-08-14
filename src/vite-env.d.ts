/// <reference types="vite/client" />
/// <reference types="svelte" />

declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;
declare const __BUILT_AT__: string;
declare const __DEV_BUILD__: boolean;

interface ImportMetaEnv {
  readonly VITE_ASSET_BASE_URL: string;
  readonly VITE_ENABLE_ANALYTICS: string;
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_DEBUG_PANEL: string;
  readonly VITE_TIME_ENDPOINT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
