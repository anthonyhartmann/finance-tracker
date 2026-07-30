/**
 * Build the GAS bundle. Uses esbuild with a plugin that swaps
 * adapter imports to the GAS-only version (no node code).
 */
const { build } = require('esbuild');
const path = require('path');
const fs = require('fs');

const outFile = path.join(__dirname, '..', 'appsscript', 'bundle.gs');

build({
  entryPoints: [path.join(__dirname, 'src', 'gas-entry.ts')],
  bundle: true,
  platform: 'neutral',
  target: 'es2020',
  format: 'iife',
  outfile: outFile,
  external: ['googleapis', 'fs', 'path', 'http', 'url', 'stream', 'util', 'child_process', 'os', 'crypto', 'dotenv'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  plugins: [{
    name: 'gas-adapter',
    setup(build) {
      // Intercept any import that resolves to adapter (with or without /index)
      build.onResolve({ filter: /\/adapter(\/index)?$/ }, (args) => {
        return { path: path.join(__dirname, 'src', 'adapter', 'gas-bundle.ts') };
      });
      // Also intercept imports from within adapter itself (for node-sheet etc.)
      build.onResolve({ filter: /\/adapter\/node-/ }, () => {
        return { external: true, namespace: 'skip' };
      });
    },
  }],
}).then(() => {
  // Append bare function declarations for GAS simple triggers.
  // Simple triggers (onEdit, onOpen) must be top-level function declarations,
  // not globalThis assignments — GAS detects them at parse time.
  // The onEdit implementation calls helpers exposed on globalThis by gas-entry.ts
  // so it can refresh the dashboard without relying on a nested closure.
  const footer = [
    '',
    '// ==================== GAS simple triggers ====================',
    '// Must be top-level function declarations, not inside the IIFE.',
    'function onEdit(e) {',
    '  if (!e || !e.range) return;',
    '  var sheet = e.range.getSheet();',
    '  var sheetName = sheet ? sheet.getName() : "none";',
    '  var row = e.range.getRow();',
    '  var col = e.range.getColumn();',
    '  var log = function(msg) { return typeof _debugLog === "function" ? _debugLog("onEdit", msg) : Promise.resolve(); };',
    '  var logError = function(err) { return typeof _debugError === "function" ? _debugError("onEdit", err) : Promise.resolve(); };',
    '  // Log every edit so we can diagnose sheet names / trigger issues.',
    '  return log("Edit event: sheet=" + sheetName + " row=" + row + " col=" + col).then(function() {',
    '    if (!sheet) return;',
    '    var nameLower = sheetName.toLowerCase();',
    '    var isDashboard = nameLower.indexOf("dashboard") >= 0;',
    '    var isAdjustments = nameLower.indexOf("adjustments") >= 0;',
    '    if (!isDashboard && !isAdjustments) return;',
    '    if (isDashboard && col === 2 && row === 2) {',
    '      // B2 = "Refresh All" checkbox — triggers full sync (Plaid + calendar + savings + dashboard)',
    '      return log("Full refresh triggered from dashboard B2").then(function() {',
    '        if (typeof globalThis.refreshAll === "function") {',
    '          return globalThis.refreshAll().catch(logError);',
    '        }',
    '      });',
    '    }',
    '    var shouldRefresh = false;',
    '    if (isDashboard && col === 2) {',
    '      // B4=month, B5=target, B15=include upcoming, B30=non-standard, B31=cancellations',
    '      shouldRefresh = row === 4 || row === 5 || row === 15 || row === 30 || row === 31;',
    '    }',
    '    if (isAdjustments) {',
    '      // Any edit in the adjustments tab should refresh the dashboard totals.',
    '      shouldRefresh = true;',
    '    }',
    '    if (!shouldRefresh) return;',
    '    return log("Recalc triggered from " + sheetName + " B" + row).then(function() {',
    '      if (typeof _dashboardRefresh === "function") {',
    '        return _dashboardRefresh().catch(logError);',
    '      }',
    '    });',
    '  });',
    '}',
    '',
    '// ==================== UI-runnable wrappers ====================',
    '// These delegate to the functions assigned to globalThis inside the IIFE.',
    'function syncAllProductionAccounts() { if (globalThis.syncAllProductionAccounts) return globalThis.syncAllProductionAccounts(); }',
    'function scheduledRefresh() { if (globalThis.scheduledRefresh) return globalThis.scheduledRefresh(); }',
    'function refreshAll() { if (globalThis.refreshAll) return globalThis.refreshAll(); }',
    'function resetAndResync() { if (globalThis.resetAndResync) return globalThis.resetAndResync(); }',
    'function ensureTriggers() { if (globalThis.ensureTriggers) return globalThis.ensureTriggers(); }',
    'function listTriggers() { if (globalThis.listTriggers) return globalThis.listTriggers(); }',
    'function cleanupTriggers() { if (globalThis.cleanupTriggers) return globalThis.cleanupTriggers(); }',
    'function forceReleaseLock() { if (globalThis.forceReleaseLock) return globalThis.forceReleaseLock(); }',
    '',
  ].join('\n');
  fs.appendFileSync(outFile, footer);

  const stats = fs.statSync(outFile);
  console.log('GAS bundle: ' + (stats.size / 1024).toFixed(1) + ' KB -> ' + outFile);
}).catch((e) => {
  console.error('Build failed:', e);
  process.exit(1);
});
