import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
export default {
  // Lets <script lang="ts"> work in both Vite and svelte-check.
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Runes mode explicitly on. Svelte 5 infers it per-component from usage,
    // but pinning it project-wide stops a component accidentally falling back
    // to legacy reactivity and behaving differently from its siblings.
    runes: true,
  },
};
