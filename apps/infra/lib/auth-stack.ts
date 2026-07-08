import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

/**
 * Cognito user pool (Principle IV, data-model.md). Owns credentials; the app never
 * stores passwords (FR-013). Stage 2 configures the public app client's SRP flow and
 * token validity for register/login/refresh.
 *
 * Brute-force / lockout posture (research.md §7): the pool relies on Cognito's built-in
 * per-user rate limiting, which temporarily blocks repeated failed authentication
 * attempts and returns generic failures — satisfying FR-012/SC-007 without disclosing
 * account existence. Advanced security (adaptive / compromised-credentials) is a future
 * option that can be enabled here if a stricter policy is specified; the password policy
 * (min-8 + lowercase + digit, research.md §8) is the authoritative source mirrored by the
 * shared Zod schema.
 */
export class AuthStack extends Construct {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'WorkBoardUserPool', {
      userPoolName: 'WorkBoardUserPool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.userPoolClient = this.userPool.addClient('WorkBoardWebClient', {
      // Public client (no secret) driving SRP from the browser (research.md §1).
      authFlows: { userSrp: true },
      // Short-lived id/access tokens; a longer refresh window keeps the session alive
      // across reload/desktop-restart via silent refresh (FR-006, research.md §3).
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });
  }
}
