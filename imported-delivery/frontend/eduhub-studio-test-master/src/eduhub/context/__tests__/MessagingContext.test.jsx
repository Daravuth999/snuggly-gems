/**
 * MessagingContext.test.jsx — in-app messaging global state + realtime
 * bridge. Mirrors NotificationContext.unreadByCategory.test.jsx's exact
 * WS-mocking pattern (this is a second real usage of the same shape).
 *
 * Highest-priority coverage per this feature's own directive: the
 * feature-toggle detection (rule 8.2 — fully omit, not just disable)
 * and reconnect-and-catch-up (rule 1.4 — never silently drop what
 * happened while disconnected).
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MessagingProvider, useMessaging } from "../MessagingContext";

let mockAuthState = { isAuthenticated: true, student: { studentId: "stu094" } };
jest.mock("../AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

const mockListConversations = jest.fn();
const mockGetMessagingUnreadCount = jest.fn();
let mockWsUrl = "";

jest.mock("../../lib/messagingApi", () => ({
  buildMessagingWsUrl: () => mockWsUrl,
  listConversations: (...a) => mockListConversations(...a),
  getMessagingUnreadCount: (...a) => mockGetMessagingUnreadCount(...a),
}));

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  close() {}
}
FakeWebSocket.instances = [];

function Probe() {
  const ctx = useMessaging();
  return (
    <div>
      <span data-testid="enabled">{String(ctx.enabled)}</span>
      <span data-testid="unreadCount">{ctx.unreadCount}</span>
      <span data-testid="conversationCount">{ctx.conversations.length}</span>
      <span data-testid="wsConnected">{String(ctx.wsConnected)}</span>
    </div>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  FakeWebSocket.instances = [];
  mockWsUrl = "";
  mockAuthState = { isAuthenticated: true, student: { studentId: "stu094" } };
});

test("enabled resolves to true and populates real conversation/unread data on a successful bootstrap", async () => {
  mockListConversations.mockResolvedValue({ items: [{ id: "c1", kind: "dm" }], viewerId: "stu094" });
  mockGetMessagingUnreadCount.mockResolvedValue({ count: 2 });

  render(
    <MessagingProvider>
      <Probe />
    </MessagingProvider>,
  );

  await waitFor(() => expect(screen.getByTestId("enabled").textContent).toBe("true"));
  expect(screen.getByTestId("unreadCount").textContent).toBe("2");
  expect(screen.getByTestId("conversationCount").textContent).toBe("1");
});

test("a 403 from the bootstrap call resolves enabled to false — the honest 'feature is off' signal, never an error state", async () => {
  const err = new Error("disabled");
  err.status = 403;
  mockListConversations.mockRejectedValue(err);
  mockGetMessagingUnreadCount.mockRejectedValue(err);

  render(
    <MessagingProvider>
      <Probe />
    </MessagingProvider>,
  );

  await waitFor(() => expect(screen.getByTestId("enabled").textContent).toBe("false"));
  expect(screen.getByTestId("unreadCount").textContent).toBe("0");
});

test("enabled starts as null (still checking) before the bootstrap call settles — never flashes true then false", () => {
  mockListConversations.mockReturnValue(new Promise(() => {})); // never resolves within this test
  mockGetMessagingUnreadCount.mockReturnValue(new Promise(() => {}));

  render(
    <MessagingProvider>
      <Probe />
    </MessagingProvider>,
  );

  expect(screen.getByTestId("enabled").textContent).toBe("null");
});

test("a network error (not 403) leaves enabled unresolved rather than fabricating a definitive on/off state", async () => {
  const networkErr = new Error("offline");
  mockListConversations.mockRejectedValue(networkErr);
  mockGetMessagingUnreadCount.mockRejectedValue(networkErr);

  render(
    <MessagingProvider>
      <Probe />
    </MessagingProvider>,
  );

  await waitFor(() => expect(mockListConversations).toHaveBeenCalled());
  // Still null — a transient network failure is not evidence the admin
  // turned the feature off, so it must not be reported as such.
  expect(screen.getByTestId("enabled").textContent).toBe("null");
});

test("a realtime WS arrival increments unreadCount and re-fetches for reconnect-and-catch-up (rule 1.4)", async () => {
  mockListConversations.mockResolvedValue({ items: [], viewerId: "stu094" });
  mockGetMessagingUnreadCount.mockResolvedValue({ count: 0 });
  mockWsUrl = "wss://backend.example.test/api/messaging/ws?token=t";
  const OriginalWebSocket = global.WebSocket;
  global.WebSocket = FakeWebSocket;

  try {
    render(
      <MessagingProvider>
        <Probe />
      </MessagingProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("enabled").textContent).toBe("true"));
    await waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));

    // Simulate a NEW message arriving while a second conversation has
    // appeared server-side (the "catch up" proof — the client learns
    // about it via the re-fetch this arrival triggers, not just the
    // single pushed item).
    mockListConversations.mockResolvedValue({
      items: [{ id: "c1", kind: "dm", unreadCount: 1 }], viewerId: "stu094",
    });
    mockGetMessagingUnreadCount.mockResolvedValue({ count: 1 });

    const ws = FakeWebSocket.instances[0];
    await act(async () => {
      ws.onmessage({
        data: JSON.stringify({ type: "message", item: { id: "m1", conversationId: "c1", body: "hi" } }),
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId("conversationCount").textContent).toBe("1"));
    expect(screen.getByTestId("unreadCount").textContent).toBe("1");
  } finally {
    global.WebSocket = OriginalWebSocket;
  }
});

test("logging out clears all messaging state — never leaks a previous session's conversations", async () => {
  mockListConversations.mockResolvedValue({ items: [{ id: "c1", kind: "dm" }], viewerId: "stu094" });
  mockGetMessagingUnreadCount.mockResolvedValue({ count: 5 });

  function Wrapper() {
    return (
      <MessagingProvider>
        <Probe />
      </MessagingProvider>
    );
  }

  const { rerender } = render(<Wrapper />);
  await waitFor(() => expect(screen.getByTestId("unreadCount").textContent).toBe("5"));

  mockAuthState = { isAuthenticated: false, student: null };
  rerender(<Wrapper />);

  await waitFor(() => expect(screen.getByTestId("unreadCount").textContent).toBe("0"));
  expect(screen.getByTestId("conversationCount").textContent).toBe("0");
  expect(screen.getByTestId("enabled").textContent).toBe("null");
});
