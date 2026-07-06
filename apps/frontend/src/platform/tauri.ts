import type { PlatformAdapter } from './platform';

/** Tauri desktop implementation of the platform adapter. */
export const tauriPlatform: PlatformAdapter = {
  name: 'desktop',
  isDesktop: () => true,
};
