/**
 * usePushNotifications.test.js — this hook used to be one of THREE
 * independent navigator.serviceWorker.register() call sites racing each
 * other at app boot (the actual root cause behind the installed-PWA
 * stale-version incident — see pwaUpdateController.js's v1.9.1 comment).
 * It must now only ever READ the registration that pwaUpdateController.js
 * owns — never create its own.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import usePushNotifications from "../usePushNotifications";

function mockServiceWorker({ getRegistration, ready } = {}) {
  const sw = {
    getRegistration: jest.fn(() => Promise.resolve(getRegistration ?? null)),
    register: jest.fn(() => Promise.reject(new Error("must never be called by this hook"))),
    ready: ready ?? new Promise(() => {}), // never resolves unless overridden
  };
  Object.defineProperty(navigator, "serviceWorker", { value: sw, configurable: true });
  Object.defineProperty(window, "PushManager", { value: function PushManager() {}, configurable: true });
  Object.defineProperty(window, "Notification", {
    value: { permission: "default", requestPermission: jest.fn() },
    configurable: true,
  });
  return sw;
}

describe("usePushNotifications — ensureRegistration", () => {
  test("reuses an existing registration and never calls register()", async () => {
    const subscription = { toJSON: () => ({}) };
    const existing = { active: { scriptURL: "/sw.js" }, waiting: null, pushManager: { getSubscription: jest.fn(() => Promise.resolve(subscription)) } };
    const sw = mockServiceWorker({ getRegistration: existing });

    renderHook(() => usePushNotifications("stu094", "class-a"));

    await waitFor(() => expect(sw.getRegistration).toHaveBeenCalled());
    expect(sw.register).not.toHaveBeenCalled();
  });

  test("with no registration yet, awaits the owner's registration via `ready` — bounded, never hangs, and still never registers itself", async () => {
    let resolveReady;
    const readyPromise = new Promise((res) => { resolveReady = res; });
    const sw = mockServiceWorker({ getRegistration: null, ready: readyPromise });

    const { result } = renderHook(() => usePushNotifications("stu094", "class-a"));

    await waitFor(() => expect(sw.getRegistration).toHaveBeenCalled());

    // Simulate pwaUpdateController's registration settling shortly after.
    const owned = { active: { scriptURL: "/sw.js" }, pushManager: { getSubscription: jest.fn(() => Promise.resolve(null)) } };
    await act(async () => { resolveReady(owned); });

    expect(sw.register).not.toHaveBeenCalled();
    expect(result.current.supported).toBe(true);
  }, 10000);
});
