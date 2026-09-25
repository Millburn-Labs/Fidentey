import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Midnight SDK's WASM bindings (proof/ledger crypto) expect Node's Buffer
// global even when bundled for the browser — polyfilled in src/polyfills.ts
// (loaded first, in index.html) rather than via vite-plugin-node-polyfills,
// which doesn't yet support Vite 8's Rolldown bundler (fails to resolve its
// own buffer shim at build time).
export default defineConfig({
  plugins: [react()],
  resolve: {
    // `level`'s browser build (used by the private-state provider) still
    // reaches for Node's `events.EventEmitter`; Vite externalizes Node
    // built-ins with no shim by default, so alias to a real implementation.
    alias: { buffer: 'buffer', events: 'events' },
  },
  define: {
    global: 'globalThis',
  },
  server: {
    // The Lace wallet's proving logic fetches ZK artifacts (prover/verifier
    // keys, zkir) from this dev server as a cross-origin request from the
    // extension's own context. Vite's default CORS handling doesn't reflect
    // non-http(s) origins like chrome-extension://, so no Access-Control-
    // Allow-Origin header comes back and the browser blocks the response —
    // surfacing only as a generic "TypeError: Failed to fetch" with no
    // indication it was a CORS issue. `origin: true` unconditionally
    // reflects whatever Origin was sent, http(s) or not.
    cors: { origin: true },
  },
  optimizeDeps: {
    // esbuild's dev-time dependency pre-bundling reorders these wasm-bindgen
    // glue modules in a way that breaks their internal init ordering
    // (ReferenceError: Cannot access '__wbindgen_start' before initialization).
    // They must be loaded as Vite/the browser sees them, untouched.
    exclude: [
      '@midnight-ntwrk/ledger-v8',
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/compact-runtime',
    ],
    // Excluding the wasm packages above also stops esbuild's scanner from
    // reaching (and CJS->ESM interop-converting) some of their deep,
    // CommonJS-only transitive deps. Force those specific ones back in.
    include: ['object-inspect'],
  },
});
