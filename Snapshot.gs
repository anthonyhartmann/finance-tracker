/**
 * Snapshot.gs — Save a full month-end copy of all data tabs.
 *
 * Creates read-only copies suffixed with the month (e.g. transactions_2026-07).
 * Run manually before flipping to a new month, or let it auto-fire on rollover.
 */

const SNAPSHOT = {
  TABS: ["transactions", "interview_income", "adjustments", "dashboard"],

  /**
   * Snapshot all tabs for a given month.
   * @param {string} month  YYYY-MM
   */
  snapshotMonth: function (month) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var suffix = "_" + month;
    var created = [];
    var skipped = [];

    for (var i = 0; i < this.TABS.length; i++) {
      var srcName = this.TABS[i];
      var dstName = srcName + suffix;
      var src = ss.getSheetByName(srcName);
      var existing = ss.getSheetByName(dstName);

      if (!src) {
        skipped.push(srcName + " (missing)");
        continue;
      }

      if (existing) {
        // Overwrite existing snapshot for this month
        ss.deleteSheet(existing);
      }

      var copy = src.copyTo(ss);
      copy.setName(dstName);
      created.push(dstName);
    }

    Debug.log("Snapshot.snapshotMonth", "Month " + month + ": created " + created.length + " snapshots" + (skipped.length ? ", skipped: " + skipped.join(", ") : ""));
    return { created: created, skipped: skipped };
  },

  /**
   * Snapshot the month currently shown in the dashboard.
   */
  snapshotCurrentMonth: function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dash = ss.getSheetByName("dashboard");
    if (!dash) {
      Debug.error("Snapshot.snapshotCurrentMonth", "dashboard tab not found");
      return;
    }
    var month = dash.getRange("B4").getValue();
    if (!month || typeof month !== "string" || month.indexOf("-") === -1) {
      Debug.error("Snapshot.snapshotCurrentMonth", "Invalid month in dashboard B4: " + month);
      return;
    }
    this.snapshotMonth(month);
  },

  /**
   * Auto-snapshot the PREVIOUS month when the dashboard month rolls over.
   * Called from Dashboard.maybeResetManualInputs before inputs are reset.
   * @param {string} previousMonth  YYYY-MM
   */
  autoSnapshotOnRollover: function (previousMonth) {
    if (!previousMonth) return;
    Debug.log("Snapshot.autoSnapshotOnRollover", "Auto-snapshotting previous month: " + previousMonth);
    this.snapshotMonth(previousMonth);
  }
};

function snapshotCurrentMonth() {
  SNAPSHOT.snapshotCurrentMonth();
}

function snapshotMonth(month) {
  SNAPSHOT.snapshotMonth(month);
}
