import type { PlatformAdapter } from './platform';

/** Web/PWA implementation of the platform adapter. */
export const webPlatform: PlatformAdapter = {
  name: 'web',
  isDesktop: () => false,
};
