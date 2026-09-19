/**
 * bootVersionGate.test.js — the launch-time half of the installed-PWA
 * stale-version fix (see bootVersionGate.js's own header for the full
 * story; pwaUpdateController.test.js covers the running-app half).
 */
jest.mock("../appVersion", () => ({
  getRunningBuildId: jest.fn(),
  fetchDeployedBuildId: jest.fn(),
}));

import { getRunningBuildId, fetchDeployedBuildId } from "../appVersion";
import { checkBootVersion, reloadForLatestVersion } from "../bootVersionGate";

describe("checkBootVersion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("no build stamp at all (e.g. local dev) resolves 'current' with zero network calls", async () => {
    getRunningBuildId.mockReturnValue(null);
    const result = await checkBootVersion();
    expect(result).toBe("current");
    expect(fetchDeployedBuildId).not.toHaveBeenCalled();
  });

  test("matching running/deployed build ids resolves 'current'", async () => {
    getRunningBuildId.mockReturnValue("v1.9.0-abc123-20260818");
    fetchDeployedBuildId.mockResolvedValue("v1.9.0-abc123-20260818");
    const result = await checkBootVersion();
    expect(result).toBe("current");
  });

  test("a genuinely newer deployed build resolves 'reload' and sets the once-per-window guard", async () => {
    getRunningBuildId.mockReturnValue("v1.9.0-old-20260801");
    fetchDeployedBuildId.mockResolvedValue("v1.9.0-new-20260818");
    const result = await checkBootVersion();
    expect(result).toBe("reload");
    expect(sessionStorage.getItem("__eduhub_boot_gate_reload_ts")).toBeTruthy();
  });

  test("offline / fetch failure (null) never blocks launch — resolves 'unknown', uses last known good", async () => {
    getRunningBuildId.mockReturnValue("v1.9.0-abc123-20260818");
    fetchDeployedBuildId.mockResolvedValue(null);
    const result = await checkBootVersion();
    expect(result).toBe("unknown");
  });

  test("a hung network request never holds the launch screen past the bounded timeout", async () => {
    jest.useFakeTimers();
    getRunningBuildId.mockReturnValue("v1.9.0-abc123-20260818");
    fetchDeployedBuildId.mockReturnValue(new Promise(() => {})); // never resolves
    const resultPromise = checkBootVersion();
    jest.advanceTimersByTime(1200);
    const result = await resultPromise;
    expect(result).toBe("unknown");
    jest.useRealTimers();
  });

  test("never reload-loops: a mismatch persisting after an already-attempted reload this session resolves 'unknown', not another 'reload'", async () => {
    getRunningBuildId.mockReturnValue("v1.9.0-old-20260801");
    fetchDeployedBuildId.mockResolvedValue("v1.9.0-new-20260818");
    const first = await checkBootVersion();
    expect(first).toBe("reload");
    fetchDeployedBuildId.mockClear();
    const second = await checkBootVersion();
    expect(second).toBe("unknown");
    // The guard short-circuits before any second network round-trip.
    expect(fetchDeployedBuildId).not.toHaveBeenCalled();
  });

  test("the once-per-window guard expires after its window, allowing a fresh reload decision", async () => {
    getRunningBuildId.mockReturnValue("v1.9.0-old-20260801");
    // Simulate a reload already attempted 31s ago (past the 30s window) —
    // real Date.now() throughout, no timer mocking needed for this one.
    sessionStorage.setItem("__eduhub_boot_gate_reload_ts", String(Date.now() - 31_000));
    fetchDeployedBuildId.mockResolvedValue("v1.9.0-newer-20260819");
    const result = await checkBootVersion();
    expect(result).toBe("reload");
  });
});

describe("reloadForLatestVersion", () => {
  test("navigates via window.location.reload()", () => {
    const originalLocation = window.location;
    const reloadSpy = jest.fn();
    delete window.location;
    window.location = { ...originalLocation, reload: reloadSpy };
    reloadForLatestVersion();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    window.location = originalLocation;
  });
});
