// electron-vite build/dev config — one file drives all three processes
// (main, preload, renderer). Each gets its own Vite/Rollup sub-config.
//
// Output layout: out/main, out/preload, out/renderer (gitignored). This is
// deliberately separate from electron-builder's own "dist" output dir
// (package.json build.directories.output) — no collision.
//
// src/main is now all-ESM TypeScript (Phase 3), so Rollup bundles its local
// import/export graph natively — no commonjsOptions.include workaround
// needed any more (that was only required while src/main was plain CJS
// require()-based JS, which Vite's default commonjsOptions only inlines for
// node_modules, not project source).
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

const sharedAlias = { '@shared': resolve(__dirname, 'src/shared') };

// Production index.html keeps its strict CSP
// (`script-src 'self'; ...`) byte-for-byte. In dev, @vitejs/plugin-react
// injects an inline React-Fast-Refresh preamble <script> and the Vite
// client opens a ws:// HMR socket — both would otherwise be silently
// blocked by that CSP. Swap in a relaxed, dev-only CSP via
// transformIndexHtml rather than loosening the shipped one.
function devCspPlugin(): Plugin {
  return {
    name: 'dev-only-csp',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.server === undefined) return html; // production build — leave as-is
        return html.replace(
          /<meta http-equiv="Content-Security-Policy"[^>]*>/,
          '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; connect-src \'self\' ws://localhost:* http://localhost:*; img-src \'self\' data:;" />'
        );
      },
    },
  };
}

export default defineConfig({
  main: {
    // build.externalizeDeps defaults to true (electron-vite keeps
    // node_modules deps like electron-updater external rather than bundled,
    // matching the previous plain-require() behavior) — no plugin needed;
    // the standalone externalizeDepsPlugin() is deprecated in favor of this.
    resolve: { alias: sharedAlias },
  },
  preload: {
    resolve: { alias: sharedAlias },
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: sharedAlias },
    plugins: [react(), devCspPlugin()],
  },
});
