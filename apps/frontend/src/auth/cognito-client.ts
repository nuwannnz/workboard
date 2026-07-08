import {
  CognitoUserPool,
  CognitoUser,
  CognitoUserAttribute,
  CognitoRefreshToken,
  AuthenticationDetails,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';
import type { TokenBundle } from '../platform/platform';

/** Extract the id/access/refresh JWTs from a Cognito session into our TokenBundle. */
function bundleFromSession(session: CognitoUserSession): TokenBundle {
  return {
    accessToken: session.getAccessToken().getJwtToken(),
    idToken: session.getIdToken().getJwtToken(),
    refreshToken: session.getRefreshToken().getToken(),
  };
}

/** Cognito pool configuration sourced from build-time env (never committed — FR-013). */
export interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  /**
   * Optional service endpoint. When set (fully-local dev), SDK calls target the cognito-local
   * emulator (via the Vite `/cognito` proxy) instead of real AWS Cognito. Empty in production.
   */
  endpoint?: string;
}

export function readCognitoConfig(): CognitoConfig {
  return {
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
    endpoint: import.meta.env.VITE_COGNITO_ENDPOINT || undefined,
  };
}

/**
 * Thin SRP wrapper over `amazon-cognito-identity-js` (research §1). Drives register /
 * verify / login / refresh / logout directly against the public app client (no secret);
 * passwords are handled by the library's client-side SRP and never stored by the app
 * (FR-013). Callback-based Cognito APIs are promisified per method.
 *
 * Method bodies are filled per user story: signUp/confirm/resend (T025), authenticate /
 * getSession / refreshSession (T032), signOut (T042).
 */
export class CognitoClient {
  private readonly config: CognitoConfig;
  private poolInstance?: CognitoUserPool;

  constructor(config: CognitoConfig = readCognitoConfig()) {
    this.config = config;
  }

  /**
   * The Cognito pool, created lazily on first use. Deferring construction means the app
   * (e.g. the public /login route + the unauthenticated redirect) still loads even before
   * `VITE_COGNITO_*` is configured — only actual auth operations require valid config.
   */
  private pool(): CognitoUserPool {
    if (!this.poolInstance) {
      this.poolInstance = new CognitoUserPool({
        UserPoolId: this.config.userPoolId,
        ClientId: this.config.clientId,
        // Local dev only: route to the cognito-local emulator. Undefined in prod → real AWS.
        ...(this.config.endpoint ? { endpoint: this.config.endpoint } : {}),
      });
    }
    return this.poolInstance;
  }

  /** Builds a CognitoUser bound to this pool for the given email (username). */
  protected cognitoUser(email: string): CognitoUser {
    return new CognitoUser({ Username: email, Pool: this.pool() });
  }

  /** Currently-cached user (from the library's own storage), if any. */
  protected currentUser(): CognitoUser | null {
    return this.pool().getCurrentUser();
  }

  // --- Registration & verification (T025) ---

  /**
   * Register a new account. On `UsernameExistsException` we resolve with the same neutral
   * success as a first-time signup so the UI never discloses whether an email is already
   * registered (FR-001, research §6). Any other error rejects.
   */
  signUp(email: string, password: string): Promise<void> {
    const attributes = [new CognitoUserAttribute({ Name: 'email', Value: email })];
    return new Promise((resolve, reject) => {
      this.pool().signUp(email, password, attributes, [], (err) => {
        if (err) {
          if (err.name === 'UsernameExistsException') {
            resolve();
            return;
          }
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /** Confirm email ownership with the emailed code → account becomes CONFIRMED. */
  confirmRegistration(email: string, code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cognitoUser(email).confirmRegistration(code, true, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** Resend the verification code (code expired / never arrived). */
  resendConfirmationCode(email: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cognitoUser(email).resendConfirmationCode((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // --- Login & session (T032) ---

  /**
   * Log in via SRP (passwords never leave the client in plaintext — research §1).
   * `UserNotConfirmedException` propagates with its name so the caller can route to the
   * verify screen; wrong credentials surface as `NotAuthorizedException` (research §5).
   */
  authenticate(email: string, password: string): Promise<TokenBundle> {
    const user = this.cognitoUser(email);
    // The cognito-local emulator (local dev) implements only USER_PASSWORD_AUTH, not SRP, so
    // force the plain flow when pointed at a local endpoint. Production keeps the default SRP.
    if (this.config.endpoint) {
      user.setAuthenticationFlowType('USER_PASSWORD_AUTH');
    }
    const details = new AuthenticationDetails({ Username: email, Password: password });
    return new Promise((resolve, reject) => {
      user.authenticateUser(details, {
        onSuccess: (session) => resolve(bundleFromSession(session)),
        onFailure: (err) => reject(err),
      });
    });
  }

  /** Current cached session for the signed-in user, if still valid; else null. */
  getSession(): Promise<TokenBundle | null> {
    const user = this.currentUser();
    if (!user) return Promise.resolve(null);
    return new Promise((resolve) => {
      user.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session || !session.isValid()) {
          resolve(null);
          return;
        }
        resolve(bundleFromSession(session));
      });
    });
  }

  /**
   * Silently renew tokens from a valid refresh token (FR-006). `username` is the account's
   * Cognito username (from the expired id token's claims) needed to construct the user.
   */
  refreshSession(refreshToken: string, username: string): Promise<TokenBundle> {
    const user = this.cognitoUser(username);
    const token = new CognitoRefreshToken({ RefreshToken: refreshToken });
    return new Promise((resolve, reject) => {
      user.refreshSession(token, (err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session) {
          reject(err ?? new Error('refresh failed'));
          return;
        }
        resolve(bundleFromSession(session));
      });
    });
  }

  // --- Logout (T042) ---

  /** Clear the library's cached tokens for the current user (FR-007). */
  async signOut(): Promise<void> {
    this.currentUser()?.signOut();
  }
}
