import {
  CognitoIdentityProviderClient,
  ResendConfirmationCodeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { MeResponse } from '@workboard/shared';
import type { AuthContext } from '../../middleware/authenticate';
import { loadConfig } from '../../shared/config';
import { ProfileRepository } from './profile.repository';

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
 * Auth business logic (Principle I). Orchestrates the profile bootstrap for the
 * identity boundary (`GET /me`) and the resend-verification helper. No HTTP or SDK
 * concerns leak in — routes/controllers stay thin, persistence stays in the repository.
 */
export class AuthService {
  constructor(
    private readonly profiles: ProfileRepository = new ProfileRepository(),
    private readonly idp: CognitoIdentityProviderClient = new CognitoIdentityProviderClient({
      region: loadConfig().region,
    }),
  ) {}

  /**
   * Returns the authenticated account profile, lazily bootstrapping it on first access
   * (FR-010). Ownership is derived from the verified `sub`; the email is copied from the
   * token claims. The controller validates the shape against `meResponseSchema`.
   */
  async getProfile(auth: AuthContext): Promise<MeResponse> {
    const profile = await this.profiles.getOrCreateProfile(auth.sub, auth.email);
    return { id: profile.id, email: profile.email };
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
