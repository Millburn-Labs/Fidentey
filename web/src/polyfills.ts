import { Buffer } from 'buffer';

// The Midnight SDK's WASM bindings (@midnight-ntwrk/compact-runtime and friends)
// expect Node's Buffer global even when running in the browser. Must be set
// before anything else imports those packages.
if (!('Buffer' in window)) {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

// `cross-fetch` (used internally by @midnight-ntwrk/midnight-js-fetch-zk-config-provider
// and midnight-js-indexer-public-data-provider) grabs a bare reference to
// `window.fetch` and calls it unbound — native fetch then throws
// "Failed to execute 'fetch' on 'Window': Illegal invocation" because it
// requires `this` to be the Window. Replacing the global with an
// already-bound wrapper fixes it transparently for every consumer, however
// they captured the reference, as long as this runs before they do.
window.fetch = window.fetch.bind(window);
