/**
 * Tests.gs — Diagnostics.
 *
 * Active:
 * - testDebugLogging() — sanity check that the Debug system works. Safe anytime.
 */

/**
 * Verify the debug logging system works.
 * If you see entries in the hidden "debug" tab, we're live.
 */
function testDebugLogging() {
  // Self-test: validate Debug module loaded
  if (typeof Debug === 'undefined') {
    throw new Error(
      'Debug module not found. Check that Debug.gs exists and has no syntax errors. '
      + 'If you see "ReferenceError: Debug is not defined", the file didn\'t compile.'
    );
  }
  if (typeof Debug.ensureTab !== 'function') {
    throw new Error('Debug.ensureTab() is missing — Debug.gs may be corrupted.');
  }

  Debug.ensureTab();
  Debug.log("testDebugLogging", "Self-test passed — Debug module loaded correctly");
  Debug.log("testDebugLogging", "Debug tab initialized");
  Debug.logRaw("testDebugLogging", { status: "ok", timestamp: new Date().toISOString() });
  Debug.log("testDebugLogging", "[OK] Debug system works. Check the debug tab.");
}


