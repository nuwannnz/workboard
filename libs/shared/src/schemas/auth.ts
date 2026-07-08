import { z } from 'zod';

/**
 * Shared auth payload schemas (data-model.md §Shared schemas, Principle V).
 * Imported by both the frontend (client-side field-level validation) and the
 * backend (request validation) so the two validate identically. Credentials
 * themselves are never stored by the app — Cognito owns them (FR-013).
 */

/** Valid email format. Cognito remains authoritative for uniqueness (FR-001). */
export const emailSchema = z.string().trim().email();

/**
 * Password policy mirrored from the Cognito user pool (auth-stack.ts): min length
 * 8, at least one lowercase letter and one digit (research.md §8). Client feedback
 * only — Cognito enforces authoritatively so it cannot be bypassed (FR-002).
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

/** Verification code: non-empty; Cognito validates the actual format (FR-003). */
export const verificationCodeSchema = z.string().trim().min(1, 'Enter the verification code');

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const verifyRequestSchema = z.object({
  email: emailSchema,
  code: verificationCodeSchema,
});
export type VerifyRequest = z.infer<typeof verifyRequestSchema>;

export const resendVerificationRequestSchema = z.object({
  email: emailSchema,
});
export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;

/**
 * Login only checks that a password was supplied — Cognito verifies it. Enforcing the
 * full policy here would leak whether an existing password meets the current rules.
 */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** The authenticated account profile returned by `GET /me`. */
export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
