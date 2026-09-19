/**
 * MessagesThreadPage.test.jsx — one conversation's thread view.
 *
 * This file did not exist before the v2 layout/header overhaul (no prior
 * coverage of this component at all). Focuses on what changed and what
 * must never regress: a single self-contained full-height header (the
 * double-header fix itself lives in App.js's routing — this route no
 * longer renders inside AppShell at all, so there is no second header
 * for a component-level test to even see; that structural claim is
 * verified by reading App.js directly, not by this file), the real
 * design tokens used (no stock Tailwind gray-scale), the preserved gold
 * outgoing-bubble accent, and the enhanced empty state.
 */
import { render, screen, waitFor } from "@testing-library/react";
import MessagesThreadPage from "../MessagesThreadPage";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  __esModule: true,
  useNavigate: () => mockNavigate,
  useParams: () => ({ conversationId: "c1" }),
}), { virtual: true });

let mockVh = null;
jest.mock("../../../hooks/useVisualViewportHeight", () => ({
  __esModule: true,
  default: () => mockVh,
}));

let mockCtx = { enabled: true, wsConnected: false, lastArrival: null };
jest.mock("../../../context/MessagingContext", () => ({
  useMessaging: () => mockCtx,
}));

jest.mock("../../../lib/messagingApi", () => ({
  getConversation: jest.fn(),
  getConversationHistory: jest.fn(),
  markConversationRead: jest.fn(() => Promise.resolve()),
  sendTextMessage: jest.fn(),
  sendVoiceMessage: jest.fn(),
  blockStudent: jest.fn(),
  reportMessage: jest.fn(),
}));

const api = jest.requireMock("../../../lib/messagingApi");

beforeEach(() => {
  mockNavigate.mockClear();
  mockCtx = { enabled: true, wsConnected: false, lastArrival: null };
  mockVh = null;
  api.getConversation.mockResolvedValue({
    id: "c1", kind: "dm", otherDisplayName: "Sophea", viewerId: "me1", participantIds: ["me1", "sophea1"],
  });
  api.getConversationHistory.mockResolvedValue({ items: [], hasMore: false });
});

test("renders exactly one thread header, with the conversation's real name", async () => {
  render(<MessagesThreadPage />);
  await screen.findByText("Sophea");
  expect(screen.getAllByTestId("thread-header")).toHaveLength(1);
});

test("the root container falls back to the h-[100dvh] placeholder class before the real viewport height is measured", async () => {
  mockVh = null;
  render(<MessagesThreadPage />);
  await waitFor(() => expect(screen.getByTestId("thread-root")).toBeInTheDocument());
  const root = screen.getByTestId("thread-root");
  expect(root.className).toMatch(/h-\[100dvh\]/);
  expect(root.style.height).toBe("");
});

test("regression: once the real viewport height is measured, it overrides dvh with the live pixel value — this is the actual keyboard-docking fix, not just a CSS class", async () => {
  // The v2 attempt used h-[100dvh] alone and looked correct on desktop/
  // emulated inspection, but left a real dead gap above the keyboard on
  // a real installed iOS PWA (this exact codebase already has a prior
  // documented dvh-in-PWA failure too). This test proves the root
  // container's actual rendered height comes from the measured
  // useVisualViewportHeight() value, not from the dvh class alone.
  mockVh = 420; // e.g. a real device reporting the keyboard is open
  render(<MessagesThreadPage />);
  await waitFor(() => expect(screen.getByTestId("thread-root")).toBeInTheDocument());
  expect(screen.getByTestId("thread-root").style.height).toBe("420px");
});

// jsdom's CSS engine (the `cssstyle` package) doesn't implement env() at
// all — it silently drops the ENTIRE declaration (not just the env()
// part) from both the parsed CSSStyleDeclaration and the serialized
// style attribute, so no DOM-level assertion in this test environment
// can observe it, in either the header's top padding here or the
// composer's already-shipped bottom padding. Same class of gap this
// codebase already has an established workaround for (see the
// "markdown-to-jsx unmountable in Jest" fs-based structural tests) —
// a direct source-text check instead of a DOM query.
test("the thread header clears the status bar/notch via top safe-area padding (source-level check — jsdom cannot render env() at all)", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "../MessagesThreadPage.jsx"), "utf8");
  expect(src).toMatch(/data-testid="thread-header"/);
  expect(src).toMatch(/paddingTop:\s*"calc\(0\.75rem \+ env\(safe-area-inset-top\)\)"/);
});

test("shows the icon-in-tinted-circle empty state when there are no messages", async () => {
  render(<MessagesThreadPage />);
  await waitFor(() => expect(screen.getByTestId("thread-empty-state")).toBeInTheDocument());
  expect(screen.getByText("No messages yet")).toBeInTheDocument();
});

test("regression: no stock Tailwind gray-scale classes anywhere in the rendered tree", async () => {
  const { container } = render(<MessagesThreadPage />);
  await waitFor(() => expect(screen.getByTestId("thread-header")).toBeInTheDocument());
  const html = container.innerHTML;
  expect(html).not.toMatch(/\bbg-gray-\d/);
  expect(html).not.toMatch(/\btext-gray-\d/);
  expect(html).not.toMatch(/\bborder-gray-\d/);
});

test("preserves the real gold accent on the sender's own outgoing bubble", async () => {
  api.getConversationHistory.mockResolvedValue({
    items: [
      { id: "m1", conversationId: "c1", kind: "text", body: "hi there", senderId: "me1", createdAt: new Date().toISOString() },
      { id: "m2", conversationId: "c1", kind: "text", body: "hey!", senderId: "sophea1", createdAt: new Date().toISOString() },
    ],
    hasMore: false,
  });
  render(<MessagesThreadPage />);
  const ownBubble = await screen.findByTestId("message-bubble-m1");
  expect(ownBubble).toHaveStyle({ background: "#D4A843" });
  const incomingBubble = await screen.findByTestId("message-bubble-m2");
  expect(incomingBubble.className).toMatch(/border-zinc-900\/\[0\.08\]/);
});

test("block button is present for a 1:1 conversation", async () => {
  render(<MessagesThreadPage />);
  await waitFor(() => expect(screen.getByTestId("block-student-button")).toBeInTheDocument());
});

test("archived conversations show the read-only banner instead of a composer", async () => {
  api.getConversation.mockResolvedValue({
    id: "c1", kind: "dm", otherDisplayName: "Sophea", viewerId: "me1", participantIds: ["me1", "sophea1"], archived: true,
  });
  render(<MessagesThreadPage />);
  await waitFor(() => expect(screen.getByTestId("archived-banner")).toBeInTheDocument());
  expect(screen.queryByTestId("message-input")).not.toBeInTheDocument();
});

test("auto-scrolls the message list to the newest message on load, and again when the measured viewport height shrinks (keyboard opening)", async () => {
  api.getConversationHistory.mockResolvedValue({
    items: [
      { id: "m1", conversationId: "c1", kind: "text", body: "hi", senderId: "me1", createdAt: new Date().toISOString() },
    ],
    hasMore: false,
  });
  const { rerender } = render(<MessagesThreadPage />);
  const list = (await screen.findByTestId("message-bubble-m1")).closest('[class*="overflow-y-auto"]');
  // jsdom reports 0 for scrollHeight/clientHeight always — define real
  // values so the scroll assertion below is meaningful.
  Object.defineProperty(list, "scrollHeight", { value: 900, configurable: true });
  Object.defineProperty(list, "clientHeight", { value: 400, configurable: true });
  list.scrollTop = 500; // simulate "already at the bottom" after initial load
  Object.defineProperty(list, "scrollTop", { value: 500, writable: true, configurable: true });

  mockVh = 420; // the keyboard just opened, shrinking the visible area
  rerender(<MessagesThreadPage />);

  await waitFor(() => expect(list.scrollTop).toBe(list.scrollHeight));
});

test("the mic button lives inside the input control's own right-hand padding, not a separate floating button beside it", async () => {
  render(<MessagesThreadPage />);
  const input = await screen.findByTestId("message-input");
  const micButton = screen.getByTestId("start-recording-button");
  expect(input.parentElement).toBe(micButton.parentElement);
  expect(micButton.className).toMatch(/absolute/);
});
