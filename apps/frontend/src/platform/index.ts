import type { PlatformAdapter } from './platform';
import { webPlatform } from './web';
import { tauriPlatform } from './tauri';

export type { PlatformAdapter } from './platform';

/**
 * Selects the platform adapter at runtime by detecting the Tauri host, without
 * forking app code (Principle II). Tauri injects `__TAURI_INTERNALS__` on the
 * window; when absent we run as the web/PWA target.
 */
export function getPlatform(): PlatformAdapter {
  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
  return isTauri ? tauriPlatform : webPlatform;
}
