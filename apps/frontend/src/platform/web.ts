import type { PlatformAdapter, TokenBundle, TokenStore } from './platform';

const STORAGE_KEY = 'workboard.auth.tokens';

/**
 * Web/PWA token store backed by `localStorage` (research §3). The bearer id token must be
 * readable by app code to attach it to protected requests, so `localStorage` is the
 * pragmatic MVP choice; the trade-off (XSS-readable) is mitigated by a strict CSP and
 * refresh-token rotation, documented in research §3.
 */
const webTokenStore: TokenStore = {
  async load(): Promise<TokenBundle | null> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<TokenBundle>;
      if (!parsed.accessToken || !parsed.idToken || !parsed.refreshToken) return null;
      return { accessToken: parsed.accessToken, idToken: parsed.idToken, refreshToken: parsed.refreshToken };
    } catch {
      return null;
    }
  },
  async save(tokens: TokenBundle): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  },
  async clear(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
  },
};

/** Web/PWA implementation of the platform adapter. */
export const webPlatform: PlatformAdapter = {
  name: 'web',
  isDesktop: () => false,
  tokenStore: webTokenStore,
};
