/**
 * Runtime configuration sourced from environment variables (FR-017).
 * Nothing sensitive is committed; values come from the environment / CDK outputs.
 */
export interface AppConfig {
  region: string;
  tableName: string;
  /** Optional endpoint override for DynamoDB Local in development. */
  dynamoEndpoint?: string;
  port: number;
  /** Cognito user pool id (CDK output) — used by the resend helper + local verifier. */
  cognitoUserPoolId?: string;
  /** Cognito public app client id (CDK output). */
  cognitoClientId?: string;
  /**
   * Local-dev only: explicit token issuer + JWKS URI. When both are set the local verifier
   * targets a local Cognito emulator (cognito-local) via aws-jwt-verify's generic
   * `JwtRsaVerifier` instead of `CognitoJwtVerifier` (whose issuer/JWKS are fixed to AWS).
   * Unset in AWS, where the emulator does not exist.
   */
  cognitoIssuer?: string;
  cognitoJwksUri?: string;
  /**
   * Local-dev fallback flag. When true, the authenticate middleware verifies the id
   * token in-process (aws-jwt-verify) because no API Gateway authorizer sits in front.
   * False/unset in the deployed Lambda — the gateway authorizer verifies at the edge.
   */
  authLocalVerify: boolean;
}

export function loadConfig(): AppConfig {
  return {
    region: process.env.AWS_REGION ?? 'us-east-1',
    tableName: process.env.WORKBOARD_TABLE_NAME ?? 'WorkBoard',
    dynamoEndpoint: process.env.DYNAMODB_ENDPOINT || undefined,
    port: Number(process.env.PORT ?? 3000),
    cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || undefined,
    cognitoClientId: process.env.COGNITO_CLIENT_ID || undefined,
    cognitoIssuer: process.env.COGNITO_ISSUER || undefined,
    cognitoJwksUri: process.env.COGNITO_JWKS_URI || undefined,
    authLocalVerify: process.env.AUTH_LOCAL_VERIFY === 'true',
  };
}
