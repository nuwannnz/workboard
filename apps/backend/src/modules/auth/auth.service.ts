import {
  CognitoIdentityProviderClient,
  ResendConfirmationCodeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { MeResponse } from '@workboard/shared';
import type { AuthContext } from '../../middleware/authenticate';
import { loadConfig } from '../../shared/config';
import { IdentityService, identityService } from './identity.service';

/**
 * True when an error represents the identity provider being unreachable (no HTTP response
 * reached us) rather than a normal service-level rejection. Only unreachability is
 * surfaced to the caller (as 503); everything else stays neutral (FR-001, FR-015).
 */
function isProviderUnreachable(err: unknown): boolean {
  const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return !meta || meta.httpStatusCode === undefined;
}

/**
 * Auth business logic (Principle I). Orchestrates the identity boundary (`GET /me`) and the
 * resend-verification helper. No HTTP or SDK concerns leak in — routes/controllers stay
 * thin, persistence stays in the repository.
 */
export class AuthService {
  constructor(
    private readonly identity: IdentityService = identityService,
    private readonly idp: CognitoIdentityProviderClient = new CognitoIdentityProviderClient({
      region: loadConfig().region,
    }),
  ) {}

  /**
   * Returns the authenticated **app User** `{ id, email }` — the resolved `userId` (never
   * the Cognito `sub`, never `cognitoSub`), FR-014. When the request already ran through
   * `resolve-identity` the id is on `req.auth`; otherwise it is resolved (get-or-bootstrap)
   * here. The controller validates the shape against `meResponseSchema`.
   */
  async getProfile(auth: AuthContext): Promise<MeResponse> {
    const userId = auth.userId ?? (await this.identity.resolveUserId(auth.sub, auth.email));
    return { id: userId, email: auth.email };
  }

  /**
   * Resend the email verification code via Cognito. Resolves neutrally whether or not the
   * email exists (no account enumeration, FR-001); a user-state / bad-input error from the
   * provider is also swallowed. Only genuine provider-unreachability is rethrown so the
   * controller can map it to 503 (FR-015).
   */
  async resendVerification(email: string): Promise<void> {
    const config = loadConfig();
    try {
      await this.idp.send(
        new ResendConfirmationCodeCommand({ ClientId: config.cognitoClientId, Username: email }),
      );
    } catch (err) {
      if (isProviderUnreachable(err)) throw err;
      // Reached the provider but it rejected (unknown user, throttled, etc.) → stay neutral.
    }
  }
}
