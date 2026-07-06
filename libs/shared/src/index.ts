/**
 * @workboard/shared — cross-package TypeScript types + Zod schemas.
 * Single source of truth for entity shapes, imported by both frontend and
 * backend so types/validation stay consistent (Principle V).
 */
export * from './schemas/task';
export * from './schemas/project';
export * from './schemas/note';
export * from './schemas/user';
