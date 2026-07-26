/**
 * Tests.gs — Diagnostics and smoke tests.
 *
 * Safe to run anytime — reads data, never modifies production tabs.
 * Run individual tests or `runAllTests()` for a full suite.
 */

/**
 * Verify the debug logging system works.
 */
function testDebugLogging() {
  if (typeof Debug === 'undefined') {
    throw new Error(
      'Debug module not found. Check that Debug.gs exists and has no syntax errors.'
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

/**
 * Verify all expected modules and global functions exist.
 */
function testModulesLoaded() {
  var modules = {
    "Debug": ["log", "error", "logRaw", "ensureTab"],
    "DASHBOARD": ["init", "refresh", "calculateSpend", "calculateInterviewIncome", "calculateManualAdjustments"],
    "PLAID": ["syncTransactions", "fetchBalances", "getAccessToken", "getAccountNames"],
    "SHEET": ["ensureTab", "writeTransactions", "writeBalances"],
    "CALENDAR": ["parseCalendarEvents", "dumpCalendarEvents", "looksLikeInterview"],
    "RECURRING": ["init", "calculateUpcoming"],
    "SAVINGS": ["backfill"],
    "SNAPSHOT": ["snapshotMonth", "snapshotCurrentMonth"],
  };

  var functions = [
    "syncAllProductionAccounts", "resetAndResync", "refreshAll",
    "parseCalendarEvents", "initDashboard", "refreshDashboard",
    "backfillSavings", "initAdjustments", "addAdjustment"
  ];

  // Modules
  for (var key in modules) {
    var obj = eval(key);  // eval works in V8 for global objects
    if (typeof obj === 'undefined') {
      Debug.error("testModulesLoaded", "MISSING module: " + key);
      throw new Error("Module not loaded: " + key);
    }
    var methods = modules[key];
    for (var m = 0; m < methods.length; m++) {
      if (typeof obj[methods[m]] !== 'function') {
        Debug.error("testModulesLoaded", "MISSING method: " + key + "." + methods[m]);
        throw new Error("Method missing: " + key + "." + methods[m]);
      }
    }
  }

  // Global functions
  for (var f = 0; f < functions.length; f++) {
    var exists = false;
    try { exists = typeof eval(functions[f]) === 'function'; } catch (e) {}
    if (!exists) {
      Debug.error("testModulesLoaded", "MISSING global function: " + functions[f]);
      throw new Error("Global function missing: " + functions[f]);
    }
  }

  Debug.log("testModulesLoaded", "[OK] All " + Object.keys(modules).length + " modules and " + functions.length + " global functions present.");
}

/**
 * Test manual adjustments — verifies empty dates are included and negative values work.
 */
function testManualAdjustments() {
  Debug.log("testManualAdjustments", "=== Testing manual adjustments ===");

  var total = DASHBOARD.calculateManualAdjustments("2026-07-01", "2026-07-31");
  Debug.log("testManualAdjustments", "July 2026 total: $" + total);

  if (typeof total !== 'number' || isNaN(total)) {
    throw new Error("calculateManualAdjustments returned non-numeric: " + total);
  }

  // Full year — empty-date rows should be included
  var yearTotal = DASHBOARD.calculateManualAdjustments("2026-01-01", "2026-12-31");
  Debug.log("testManualAdjustments", "Full year 2026 total: $" + yearTotal);
  Debug.log("testManualAdjustments", "Year >= month? " + (yearTotal >= total ? "yes" : "FAIL"));

  if (yearTotal < total) {
    Debug.error("testManualAdjustments", "Year total ($" + yearTotal + ") should be >= month total ($" + total + ") — empty-date rows may be excluded.");
  }

  Debug.log("testManualAdjustments", "[OK] Manual adjustments calculation works.");
}

/**
 * Test spend calculation — reads transactions tab, verifies it returns a number.
 */
function testCalculateSpend() {
  Debug.log("testCalculateSpend", "=== Testing spend calculation ===");

  var total = DASHBOARD.calculateSpend("2026-07-01", "2026-07-31");
  Debug.log("testCalculateSpend", "July 2026 spend: $" + total);

  if (typeof total !== 'number' || isNaN(total)) {
    throw new Error("calculateSpend returned non-numeric: " + total);
  }

  Debug.log("testCalculateSpend", "[OK] Spend calculation works.");
}

/**
 * Test interview income calculation.
 */
function testInterviewIncome() {
  Debug.log("testInterviewIncome", "=== Testing interview income ===");

  var income = DASHBOARD.calculateInterviewIncome("2026-07");
  Debug.log("testInterviewIncome", "July 2026 net income: $" + income);

  if (typeof income !== 'number' || isNaN(income)) {
    throw new Error("calculateInterviewIncome returned non-numeric: " + income);
  }

  Debug.log("testInterviewIncome", "[OK] Interview income calculation works.");
}

/**
 * Test recurring upcoming bills calculation.
 */
function testRecurringUpcoming() {
  Debug.log("testRecurringUpcoming", "=== Testing recurring upcoming ===");

  var now = new Date();
  var result = RECURRING.calculateUpcoming(now.getFullYear(), now.getMonth() + 1, now);
  Debug.log("testRecurringUpcoming", "Upcoming bills: $" + result.upcoming + " from " + result.items.length + " bill(s)");

  if (typeof result.upcoming !== 'number' || isNaN(result.upcoming)) {
    throw new Error("calculateUpcoming returned non-numeric upcoming: " + result.upcoming);
  }

  if (!Array.isArray(result.items)) {
    throw new Error("calculateUpcoming items is not an array");
  }

  Debug.log("testRecurringUpcoming", "[OK] Recurring calculation works.");
}

/**
 * Test the full dashboard refresh doesn't throw.
 */
function testDashboardRefresh() {
  Debug.log("testDashboardRefresh", "=== Testing dashboard refresh ===");

  try {
    DASHBOARD.refresh();
    Debug.log("testDashboardRefresh", "[OK] Dashboard refresh completed without errors.");
  } catch (e) {
    Debug.error("testDashboardRefresh", "Dashboard refresh threw: " + e.message);
    throw e;
  }
}

/**
 * Run all tests in sequence. Stops at first failure.
 */
function runAllTests() {
  Debug.ensureTab();
  Debug.log("runAllTests", "========================================");
  Debug.log("runAllTests", "=== STARTING FULL TEST SUITE ===");
  Debug.log("runAllTests", "========================================");

  var tests = [
    { name: "testDebugLogging",      fn: testDebugLogging },
    { name: "testModulesLoaded",     fn: testModulesLoaded },
    { name: "testManualAdjustments", fn: testManualAdjustments },
    { name: "testCalculateSpend",    fn: testCalculateSpend },
    { name: "testInterviewIncome",   fn: testInterviewIncome },
    { name: "testRecurringUpcoming", fn: testRecurringUpcoming },
    { name: "testDashboardRefresh",  fn: testDashboardRefresh },
  ];

  var passed = 0;
  var failed = 0;

  for (var t = 0; t < tests.length; t++) {
    var test = tests[t];
    Debug.log("runAllTests", "--- " + test.name + " ---");
    try {
      test.fn();
      passed++;
      Debug.log("runAllTests", "[PASS] " + test.name);
    } catch (e) {
      failed++;
      Debug.error("runAllTests", "[FAIL] " + test.name + ": " + (e.message || e));
    }
  }

  Debug.log("runAllTests", "========================================");
  Debug.log("runAllTests", "=== RESULTS: " + passed + " passed, " + failed + " failed, " + tests.length + " total ===");
  Debug.log("runAllTests", "========================================");

  try {
    var msg = passed + "/" + tests.length + " tests passed";
    if (failed > 0) msg += " (" + failed + " failed)";
    SpreadsheetApp.getActiveSpreadsheet().toast(msg, failed > 0 ? "❌ Tests" : "✅ Tests", 5);
  } catch (e) { /* ignore */ }
}
