#!/usr/bin/env node
/**
 * Secret / bundle scan (SC-008, FR-013). Fails the build if a password or long-lived
 * secret appears in source or in the shipped frontend bundle. WorkBoard delegates
 * credentials to Cognito (SRP, public client — no secret) and sources all config from the
 * environment / CDK outputs, so none of these patterns should ever be present.
 *
 * Runs in CI after `nx build frontend`. Usage: `node tools/scripts/secret-scan.mjs`.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();

// Directories to scan for committed secrets.
const SOURCE_DIRS = ['apps', 'libs', 'tools'];
// The shipped frontend bundle (built by `nx build frontend`).
const BUNDLE_DIR = 'apps/frontend/dist';

// Paths that never contain shippable code / are not secrets by nature.
const IGNORE_SEGMENTS = [
  'node_modules',
  '/dist/',
  '/cdk.out/',
  '/out-tsc/',
  '/test-results/',
  '.env.example',
];
// Test files legitimately contain fake tokens/passwords used as fixtures.
const isTestFile = (p) => /\.(spec|test|e2e)\.[cm]?tsx?$/.test(p);

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);

/** High-signal secret patterns (avoid matching the mere word "password"). */
const PATTERNS = [
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/ },
  {
    name: 'AWS secret access key',
    re: /(?:secret[_-]?access[_-]?key|aws[_-]?secret)["'\s:=]+[A-Za-z0-9/+]{40}/i,
  },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  {
    name: 'Hardcoded password literal',
    re: /\bpassword\s*[:=]\s*["'][^"'\s]{6,}["']/i,
  },
  { name: 'Cognito client secret', re: /client[_-]?secret["'\s:=]+[A-Za-z0-9]{20,}/i },
];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (IGNORE_SEGMENTS.some((seg) => `/${rel}/`.includes(seg) || rel.endsWith(seg))) continue;
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const findings = [];

function scanFile(file, { allowTestFixtures }) {
  if (allowTestFixtures && isTestFile(file)) return;
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  const lines = content.split('\n');
  for (const { name, re } of PATTERNS) {
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i])) {
        findings.push({ file: relative(ROOT, file), line: i + 1, name });
      }
    }
  }
}

// 1) Source tree (skip test fixtures which use fake secrets intentionally).
for (const dir of SOURCE_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    if (SOURCE_EXTS.has(extname(file))) scanFile(file, { allowTestFixtures: true });
  }
}

// 2) Shipped frontend bundle — nothing sensitive may be baked in (scan everything).
if (existsSync(join(ROOT, BUNDLE_DIR))) {
  for (const file of walk(join(ROOT, BUNDLE_DIR))) {
    scanFile(file, { allowTestFixtures: false });
  }
} else {
  console.warn(
    `[secret-scan] ${BUNDLE_DIR} not found — run "nx build frontend" first to scan the bundle.`,
  );
}

if (findings.length > 0) {
  console.error('[secret-scan] Potential secrets detected:');
  for (const f of findings) console.error(`  ${f.file}:${f.line} — ${f.name}`);
  process.exit(1);
}

console.log('[secret-scan] OK — no passwords or long-lived secrets in source or the bundle.');
