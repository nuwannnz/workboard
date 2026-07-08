/**
 * Platform adapter interface (Principle II). The shared frontend codebase talks
 * only to this interface; the web and Tauri implementations live behind it so
 * there is no per-target fork of app code.
 */

/** The Cognito token set persisted across reloads / desktop restarts. */
export interface TokenBundle {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

/**
 * Secure token persistence surface (contracts/auth-client-contract.md). Web backs this
 * with `localStorage`; desktop with an OS-secure store so no credentials persist in
 * plaintext (Story 4).
 */
export interface TokenStore {
  /** Load persisted tokens on app start, or null if none. */
  load(): Promise<TokenBundle | null>;
  /** Persist tokens after login / refresh. */
  save(tokens: TokenBundle): Promise<void>;
  /** Remove all tokens on logout (no residual credentials — FR-007). */
  clear(): Promise<void>;
}

export interface PlatformAdapter {
  /** Identifies the host runtime rendering the shared shell. */
  readonly name: 'web' | 'desktop';
  /** True when running inside the Tauri desktop shell. */
  isDesktop(): boolean;
  /** Platform-specific secure token persistence. */
  readonly tokenStore: TokenStore;
}
