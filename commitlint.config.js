/**
 * Conventional Commits + SemVer enforcement (FR-016).
 * Commit messages must follow: type(scope): subject
 * e.g. `feat(backend): add health endpoint`
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
