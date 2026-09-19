/**
 * AttendanceRouteGate.jsx — chooses between the v2 analytics page and the
 * existing Passport experience based on the backend's fail-closed
 * GET /api/attendance/v2-status check. ConstellationView.jsx is completely
 * untouched and remains the default until the flag is explicitly turned on
 * (see admin_security-style two-switch gating in attendance_tools.py).
 *
 * A brief "checking" state avoids flashing the wrong experience before the
 * status resolves; on any error getV2Status() itself already resolves
 * {enabled:false} (fail-closed), so this component never needs its own
 * error handling.
 */
import { useEffect, useState } from "react";
import { getV2Status } from "./api";
import ConstellationView from "./ConstellationView";
import AttendanceOverview from "./AttendanceOverview";

export default function AttendanceRouteGate() {
  const [v2Enabled, setV2Enabled] = useState(null); // null = still checking

  useEffect(() => {
    let alive = true;
    getV2Status().then((res) => {
      if (alive) setV2Enabled(!!res.enabled);
    });
    return () => { alive = false; };
  }, []);

  if (v2Enabled === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="attendance-gate-checking">
        <div className="h-32 w-72 rounded-2xl skeleton border border-aurora-violet/30" />
      </div>
    );
  }

  return v2Enabled ? <AttendanceOverview /> : <ConstellationView />;
}
