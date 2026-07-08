import { describe, it, expect } from 'vitest';
import {
  registerRequestSchema,
  verifyRequestSchema,
  resendVerificationRequestSchema,
  loginRequestSchema,
  meResponseSchema,
} from './auth';

/**
 * Shared auth schema tests (data-model.md §Validation rules): email format, the
 * password policy (min-8 + lowercase + digit), and non-empty verification code.
 * These schemas drive identical validation on the frontend and backend (Principle V).
 */
describe('registerRequestSchema', () => {
  it('accepts a valid email + policy-compliant password', () => {
    const result = registerRequestSchema.safeParse({
      email: 'user@example.com',
      password: 'abcd1234',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = registerRequestSchema.safeParse({
      email: 'not-an-email',
      password: 'abcd1234',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(
      registerRequestSchema.safeParse({ email: 'user@example.com', password: 'abc123' }).success,
    ).toBe(false);
  });

  it('rejects a password with no lowercase letter', () => {
    expect(
      registerRequestSchema.safeParse({ email: 'user@example.com', password: 'ABCD1234' }).success,
    ).toBe(false);
  });

  it('rejects a password with no digit', () => {
    expect(
      registerRequestSchema.safeParse({ email: 'user@example.com', password: 'abcdefgh' }).success,
    ).toBe(false);
  });
});

describe('verifyRequestSchema', () => {
  it('accepts a non-empty code', () => {
    expect(
      verifyRequestSchema.safeParse({ email: 'user@example.com', code: '123456' }).success,
    ).toBe(true);
  });

  it('rejects an empty code', () => {
    expect(verifyRequestSchema.safeParse({ email: 'user@example.com', code: '' }).success).toBe(
      false,
    );
  });
});

describe('resendVerificationRequestSchema', () => {
  it('accepts a valid email', () => {
    expect(resendVerificationRequestSchema.safeParse({ email: 'user@example.com' }).success).toBe(
      true,
    );
  });

  it('rejects a malformed email', () => {
    expect(resendVerificationRequestSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('loginRequestSchema', () => {
  it('accepts any non-empty password (Cognito verifies it)', () => {
    expect(
      loginRequestSchema.safeParse({ email: 'user@example.com', password: 'x' }).success,
    ).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(
      loginRequestSchema.safeParse({ email: 'user@example.com', password: '' }).success,
    ).toBe(false);
  });
});

describe('meResponseSchema', () => {
  it('validates the authenticated profile shape', () => {
    const parsed = meResponseSchema.parse({ id: 'sub-123', email: 'user@example.com' });
    expect(parsed).toEqual({ id: 'sub-123', email: 'user@example.com' });
  });
});
