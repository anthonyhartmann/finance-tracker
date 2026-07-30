#!/usr/bin/env node
/**
 * verify-gas-bundle.js — Post-build guard for the GAS bundle.
 *
 * 1. Checks that the generated bundle does NOT contain forbidden patterns:
 *    - `process.env` (except in comments / the adapter ternary which is
 *      dead-code-eliminated at build time)
 *    - bare `fetch(` calls (GAS has no native fetch)
 *
 * 2. Validates JavaScript syntax via `new Function(...)`.
 *
 * Exits 0 on success, 1 on failure.
 */

const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', 'appsscript', 'bundle.gs');

if (!fs.existsSync(bundlePath)) {
  console.error('ERROR: bundle.gs not found at ' + bundlePath);
  console.error('Run `npm run build:gas` first.');
  process.exit(1);
}

const src = fs.readFileSync(bundlePath, 'utf8');
let failed = false;

// Strip single-line and multi-line comments for pattern matching
const stripped = src
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// Check for process.env in non-comment code
// Allow lines that are within 3 lines of a `typeof process` guard (safe pattern in runtime.ts)
const lines = stripped.split('\n');
const unsafeProcessEnv = [];
for (let i = 0; i < lines.length; i++) {
  if (/process\.env/.test(lines[i])) {
    // Check if this line or nearby lines (within 3) have typeof process guard
    let guarded = false;
    for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 1); j++) {
      if (/typeof\s+process/.test(lines[j])) {
        guarded = true;
        break;
      }
    }
    if (!guarded) {
      unsafeProcessEnv.push({ line: i + 1, text: lines[i].trim() });
    }
  }
}
if (unsafeProcessEnv.length > 0) {
  console.error('FAIL: bundle.gs contains unguarded `process.env` (' + unsafeProcessEnv.length + ' occurrence(s)):');
  for (const m of unsafeProcessEnv.slice(0, 5)) {
    console.error('  Line ' + m.line + ': ' + m.text.substring(0, 100));
  }
  console.error('  process is undefined in GAS — this will crash at load time.');
  failed = true;
}

// Check for bare fetch( calls (not inside a string or method name)
// Match `fetch(` that is NOT preceded by a dot (e.g. UrlFetchApp.fetch is OK)
const bareFetchMatches = stripped.match(/(?<!\.)fetch\s*\(/g);
if (bareFetchMatches) {
  console.error('FAIL: bundle.gs contains bare `fetch(` (' + bareFetchMatches.length + ' occurrence(s))');
  console.error('  GAS has no native fetch — use UrlFetchApp via the http adapter.');
  failed = true;
}

// Syntax check
try {
  new Function(src);
} catch (e) {
  console.error('FAIL: bundle.gs has a syntax error:');
  console.error('  ' + e.message);
  failed = true;
}

if (failed) {
  console.error('\nBundle verification FAILED. Fix the issues above before deploying.');
  process.exit(1);
}

console.log('Bundle verification PASSED (' + (src.length / 1024).toFixed(1) + ' KB, no forbidden patterns, syntax OK).');
