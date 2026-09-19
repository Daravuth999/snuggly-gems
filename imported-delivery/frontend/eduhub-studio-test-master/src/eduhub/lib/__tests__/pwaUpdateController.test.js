/**
 * pwaUpdateController.test.js — the installed-PWA stale-version incident's
 * actual fix. Covers the scenarios the investigation required:
 *   - single registration owner (the root cause of this round: three
 *     independent .register() call sites racing each other at boot)
 *   - first install never reloads (nothing was "old" to replace)
 *   - a genuine controller handover DOES trigger a reload
 *   - the reload is deferred (never dropped) while a critical operation
 *     or an in-flight iOS OAuth callback is active, and applies the
 *     instant it's safe
 *   - a controllerchange storm can never reload-loop the app
 *
 * Each test loads the controller inside jest.isolateModules() so the
 * file's module-level guards (`controllerInitialized`, `reloadScheduled`)
 * start fresh — this module is a singleton by design (see its own source
 * comments), so re-importing is the only way to simulate a fresh page load
 * per test. criticalOperationRegistry.js is loaded from the SAME isolated
 * registry (not the top-level import) so beginCriticalOperation() in each
 * test actually shares state with the controller's own require() of it.
 */
function mockServiceWorker({ controller = null } = {}) {
  const listeners = {};
  const registration = {
    active: { scriptURL: "/sw.js" },
    waiting: null,
    installing: null,
  };
  const sw = {
    controller,
    register: jest.fn(() => Promise.resolve(registration)),
    addEventListener: jest.fn((event, cb) => {
      (listeners[event] = listeners[event] || []).push(cb);
    }),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    value: sw,
    configurable: true,
  });
  return { sw, listeners, fireControllerChange: () => (listeners.controllerchange || []).forEach((cb) => cb()) };
}

function loadController() {
  let controller, criticalOps;
  jest.isolateModules(() => {
    controller = require("../pwaUpdateController");
    criticalOps = require("../criticalOperationRegistry");
  });
  return { ...controller, ...criticalOps };
}

describe("pwaUpdateController", () => {
  let reloadSpy;
  const originalLocation = window.location;

  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
    reloadSpy = jest.fn();
    // jsdom's real Location.reload is non-configurable — swap the whole
    // object for a plain one so both `.reload()` and `.hash` assignment
    // (used by the OAuth-deferral test below) work like a real location.
    delete window.location;
    window.location = { ...originalLocation, hash: "", reload: reloadSpy };
  });

  afterEach(() => {
    jest.useRealTimers();
    window.location = originalLocation;
    jest.restoreAllMocks();
  });

  test("is the sole registration owner: registers /sw.js exactly once, with updateViaCache:'none'", () => {
    const { sw } = mockServiceWorker();
    const { initPwaUpdateController } = loadController();
    initPwaUpdateController();
    expect(sw.register).toHaveBeenCalledTimes(1);
    expect(sw.register).toHaveBeenCalledWith("/sw.js", { updateViaCache: "none" });
  });

  test("is idempotent — calling init twice never registers twice", () => {
    const { sw } = mockServiceWorker();
    const { initPwaUpdateController } = loadController();
    initPwaUpdateController();
    initPwaUpdateController();
    expect(sw.register).toHaveBeenCalledTimes(1);
  });

  test("first install (no prior controller) never triggers a reload", async () => {
    const { fireControllerChange } = mockServiceWorker({ controller: null });
    const { initPwaUpdateController } = loadController();
    initPwaUpdateController();
    await Promise.resolve();
    fireControllerChange();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  test("a genuine controller handover (existing controller, then a NEW one takes over) reloads once it's safe", async () => {
    const { fireControllerChange } = mockServiceWorker({ controller: { scriptURL: "/sw.js" } });
    const { initPwaUpdateController } = loadController();
    initPwaUpdateController();
    await Promise.resolve();
    fireControllerChange();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("defers the reload while a critical operation (payment/top-up/Speaking-Lab-join) is in flight, then applies it the instant that operation ends", async () => {
    const { fireControllerChange } = mockServiceWorker({ controller: { scriptURL: "/sw.js" } });
    const { initPwaUpdateController, beginCriticalOperation } = loadController();
    initPwaUpdateController();
    await Promise.resolve();

    const endOp = beginCriticalOperation("top-up");
    fireControllerChange();
    expect(reloadSpy).not.toHaveBeenCalled();

    // Still deferred while the op is in flight, even after a poll tick.
    jest.advanceTimersByTime(2000);
    expect(reloadSpy).not.toHaveBeenCalled();

    endOp();
    jest.advanceTimersByTime(2000);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("forces the reload once the critical-operation safety valve expires, even if the operation never ends", async () => {
    const { fireControllerChange } = mockServiceWorker({ controller: { scriptURL: "/sw.js" } });
    const { initPwaUpdateController, beginCriticalOperation } = loadController();
    initPwaUpdateController();
    await Promise.resolve();

    beginCriticalOperation("stuck-operation"); // deliberately never ended
    fireControllerChange();
    expect(reloadSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2 * 60 * 1000 + 2500);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("defers the reload while an iOS OAuth callback (#session_id=) is being exchanged, then applies it once the hash clears", async () => {
    window.location.hash = "#session_id=abc123";
    const { fireControllerChange } = mockServiceWorker({ controller: { scriptURL: "/sw.js" } });
    const { initPwaUpdateController } = loadController();
    initPwaUpdateController();
    await Promise.resolve();

    fireControllerChange();
    expect(reloadSpy).not.toHaveBeenCalled();

    window.location.hash = "";
    jest.advanceTimersByTime(300);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("a controllerchange storm can never reload-loop the app — at most one reload per 10s latch window", async () => {
    // Simulate the SECOND page load after the first reload already fired
    // by pre-seeding the sessionStorage latch, as the real reload would
    // leave behind.
    sessionStorage.setItem("__pwa_update_reload_ts", String(Date.now()));
    const { fireControllerChange } = mockServiceWorker({ controller: { scriptURL: "/sw.js" } });
    const { initPwaUpdateController } = loadController();
    initPwaUpdateController();
    await Promise.resolve();

    fireControllerChange();
    // Latch is still hot — must not reload immediately.
    expect(reloadSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(10 * 1000 + 500);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
