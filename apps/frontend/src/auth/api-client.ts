/**
 * Protected-call `fetch` wrapper (contracts/auth-client-contract.md §API client). Attaches
 * the Cognito **id token** as `Authorization: Bearer <idToken>` — the token the API Gateway
 * Cognito authorizer verifies (research §2). On a `401` it attempts exactly one silent
 * refresh and retries; if that still fails it reports auth loss so the app transitions to
 * `unauthenticated` and routes to `/login` (FR-006, Story 2.5).
 *
 * Base URL comes from build-time config (`VITE_API_BASE_URL`) — never hard-coded, never a
 * committed secret.
 */
export interface ApiClientDeps {
  /** Current id token (or null when unauthenticated). */
  getIdToken: () => string | null;
  /** Attempt a silent token refresh; resolves true when a fresh token is available. */
  refresh: () => Promise<boolean>;
  /** Called when authentication is irrecoverably lost (drives redirect to /login). */
  onAuthLost: () => void;
}

export interface ApiClient {
  request(path: string, init?: RequestInit): Promise<Response>;
  get(path: string, init?: RequestInit): Promise<Response>;
}

export function createApiClient(deps: ApiClientDeps): ApiClient {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

  const doFetch = (path: string, token: string | null, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  };

  async function request(path: string, init?: RequestInit): Promise<Response> {
    let res = await doFetch(path, deps.getIdToken(), init);
    if (res.status !== 401) return res;

    // 401 (e.g. expired token) → one silent refresh, then retry once.
    const refreshed = await deps.refresh();
    if (refreshed) {
      res = await doFetch(path, deps.getIdToken(), init);
      if (res.status !== 401) return res;
    }

    // Still unauthorized → auth is lost.
    deps.onAuthLost();
    return res;
  }

  return {
    request,
    get: (path, init) => request(path, { ...init, method: 'GET' }),
  };
}
