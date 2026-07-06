/**
 * Platform adapter interface (Principle II). The shared frontend codebase talks
 * only to this interface; the web and Tauri implementations live behind it so
 * there is no per-target fork of app code. Stage 1 exposes a minimal surface;
 * later stages extend it (filesystem, notifications, etc.).
 */
export interface PlatformAdapter {
  /** Identifies the host runtime rendering the shared shell. */
  readonly name: 'web' | 'desktop';
  /** True when running inside the Tauri desktop shell. */
  isDesktop(): boolean;
}
