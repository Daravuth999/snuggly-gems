/**
 * MessagesInboxPage.test.jsx — conversation list view. Pure view over
 * MessagingContext's already-fetched state (no independent fetch of
 * its own) — honest empty state, never a fabricated "browse people"
 * prompt (rule 2: no reach to people outside an existing interaction).
 */
import { render, screen, fireEvent } from "@testing-library/react";
import MessagesInboxPage from "../MessagesInboxPage";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  __esModule: true,
  useNavigate: () => mockNavigate,
}), { virtual: true });

let mockCtx = null;
jest.mock("../../../context/MessagingContext", () => ({
  useMessaging: () => mockCtx,
}));

beforeEach(() => {
  mockNavigate.mockClear();
});

test("shows a loading state while enabled is still being checked", () => {
  mockCtx = { enabled: null, conversations: [] };
  render(<MessagesInboxPage />);
  expect(screen.getByText(/Loading messages/i)).toBeInTheDocument();
});

test("shows an honest disabled message when the feature is off, not a broken empty inbox", () => {
  mockCtx = { enabled: false, conversations: [] };
  render(<MessagesInboxPage />);
  expect(screen.getByTestId("messages-disabled")).toBeInTheDocument();
});

test("shows an honest empty state with no fabricated browse-people prompt", () => {
  mockCtx = { enabled: true, conversations: [] };
  render(<MessagesInboxPage />);
  expect(screen.getByTestId("messages-empty-state")).toBeInTheDocument();
  expect(screen.getByText(/No conversations yet/i)).toBeInTheDocument();
});

test("renders each real conversation with its real preview and unread badge", () => {
  mockCtx = {
    enabled: true,
    conversations: [
      { id: "c1", kind: "dm", otherDisplayName: "Sophea", lastMessagePreview: "See you at 7", unreadCount: 2, lastMessageAt: new Date().toISOString() },
      { id: "c2", kind: "speaking_lab_group", title: "Group 2 · Fri Sep 12 Speaking Lab", lastMessagePreview: "hello team", unreadCount: 0, lastMessageAt: new Date().toISOString() },
    ],
  };
  render(<MessagesInboxPage />);
  expect(screen.getByText("Sophea")).toBeInTheDocument();
  expect(screen.getByText("See you at 7")).toBeInTheDocument();
  expect(screen.getByTestId("conversation-unread-badge-c1")).toHaveTextContent("2");
  expect(screen.getByText("Group 2 · Fri Sep 12 Speaking Lab")).toBeInTheDocument();
  expect(screen.queryByTestId("conversation-unread-badge-c2")).not.toBeInTheDocument();
});

test("tapping a conversation row navigates to its thread", () => {
  mockCtx = {
    enabled: true,
    conversations: [{ id: "c1", kind: "dm", otherDisplayName: "Sophea", lastMessagePreview: "hi", unreadCount: 0 }],
  };
  render(<MessagesInboxPage />);
  fireEvent.click(screen.getByTestId("conversation-row-c1"));
  expect(mockNavigate).toHaveBeenCalledWith("/messages/c1");
});
