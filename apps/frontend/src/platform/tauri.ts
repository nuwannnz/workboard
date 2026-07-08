import { load, type Store } from '@tauri-apps/plugin-store';
import type { PlatformAdapter, TokenBundle, TokenStore } from './platform';

const STORE_FILE = 'auth.dat';
const TOKENS_KEY = 'tokens';

/**
 * Desktop token store backed by the Tauri secure store (`@tauri-apps/plugin-store`), so
 * nothing sensitive persists in plaintext on the desktop and no residual credentials
 * remain after logout on a shared device (Story 4). The same shared app code drives this
 * via the adapter — no per-target fork (Principle II).
 */
let storePromise: Promise<Store> | undefined;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load(STORE_FILE, { defaults: {}, autoSave: true });
  return storePromise;
}

const tauriTokenStore: TokenStore = {
  async load(): Promise<TokenBundle | null> {
    const store = await getStore();
    const tokens = await store.get<TokenBundle>(TOKENS_KEY);
    if (!tokens?.accessToken || !tokens.idToken || !tokens.refreshToken) return null;
    return tokens;
  },
  async save(tokens: TokenBundle): Promise<void> {
    const store = await getStore();
    await store.set(TOKENS_KEY, tokens);
    await store.save();
  },
  async clear(): Promise<void> {
    const store = await getStore();
    await store.delete(TOKENS_KEY);
    await store.save();
  },
};

/** Tauri desktop implementation of the platform adapter. */
export const tauriPlatform: PlatformAdapter = {
  name: 'desktop',
  isDesktop: () => true,
  tokenStore: tauriTokenStore,
};
