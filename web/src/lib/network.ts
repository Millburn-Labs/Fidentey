// Preview testnet — matches ../../../scripts/network.ts NETWORK_CONFIGS.preview.
// (Fidentey's Level 1 contract is deployed on Preview, not Preprod — see README.)
export const NETWORK_ID = 'preview';
export const INDEXER_URI = 'https://indexer.preview.midnight.network/api/v4/graphql';
export const INDEXER_WS_URI = 'wss://indexer.preview.midnight.network/api/v4/graphql/ws';
export const CONTRACT_ADDRESS = 'be09d0480809e425d8b271bb36d3e95992ce9d8d1446fcce86a75319795706b0';

// Served from web/public/managed/fidentey (copied from ../managed/fidentey at build time).
// FetchZkConfigProvider does `new URL(baseURL)` internally, which throws on a
// root-relative path — it must be absolute, so it's derived from the current
// origin rather than hardcoded (works unchanged in dev and once deployed).
export const ZK_CONFIG_BASE_URL = `${window.location.origin}/managed/fidentey`;

export const PRIVATE_STATE_ID = 'fidenteyPrivateState';
