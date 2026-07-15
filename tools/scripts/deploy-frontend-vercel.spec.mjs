import { describe, it, expect } from 'vitest';
import { buildProdEnv } from './deploy-frontend-vercel.mjs';

const outputs = {
  apiBaseUrl: 'https://abc123.execute-api.eu-west-1.amazonaws.com/prod',
  userPoolId: 'eu-west-1_POOL',
  clientId: 'client-id-123',
};

describe('buildProdEnv', () => {
  it('maps the CDK outputs onto the VITE_* build vars', () => {
    const env = buildProdEnv(outputs, '1.4.0');
    expect(env.VITE_API_BASE_URL).toBe(outputs.apiBaseUrl);
    expect(env.VITE_COGNITO_USER_POOL_ID).toBe(outputs.userPoolId);
    expect(env.VITE_COGNITO_CLIENT_ID).toBe(outputs.clientId);
  });

  it('stamps the release version into VITE_APP_VERSION', () => {
    expect(buildProdEnv(outputs, '2.0.1').VITE_APP_VERSION).toBe('2.0.1');
  });

  it('falls back to 0.0.0-dev when no version is provided', () => {
    expect(buildProdEnv(outputs).VITE_APP_VERSION).toBe('0.0.0-dev');
    expect(buildProdEnv(outputs, '').VITE_APP_VERSION).toBe('0.0.0-dev');
  });

  it('forces VITE_COGNITO_ENDPOINT empty so prod uses real Cognito SRP, never the emulator', () => {
    const env = buildProdEnv(outputs, '1.0.0');
    expect(env.VITE_COGNITO_ENDPOINT).toBe('');
  });

  it('never emits a non-VITE_ key (nothing non-public can reach the bundle)', () => {
    for (const key of Object.keys(buildProdEnv(outputs, '1.0.0'))) {
      expect(key).toMatch(/^VITE_/);
    }
  });
});
