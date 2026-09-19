import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SecurityPanel from "../SecurityPanel";
import { forceLogoutAllUsers } from "../../../eduhub/auth/studentAuthService";
import { useStudioAuth } from "../../StudioAuth";

jest.mock("../../../eduhub/auth/studentAuthService", () => ({
  forceLogoutAllUsers: jest.fn(),
}));

jest.mock("../../StudioAuth", () => ({
  useStudioAuth: jest.fn(),
}));

describe("SecurityPanel — Force All Users to Sign Out", () => {
  let signOut;

  beforeEach(() => {
    jest.clearAllMocks();
    signOut = jest.fn();
    useStudioAuth.mockReturnValue({ signOut });
  });

  test("renders the control with clear, non-accidental copy", () => {
    render(<SecurityPanel />);
    expect(screen.getByTestId("security-force-logout-open")).toHaveTextContent(
      "Force All Users to Sign Out",
    );
    expect(screen.getByText(/Require all currently signed-in users to authenticate again/i)).toBeInTheDocument();
  });

  test("clicking the action opens a confirmation dialog before doing anything", () => {
    render(<SecurityPanel />);
    expect(screen.queryByTestId("security-force-logout-confirm")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("security-force-logout-open"));
    expect(screen.getByTestId("security-force-logout-confirm")).toBeInTheDocument();
    expect(forceLogoutAllUsers).not.toHaveBeenCalled();
  });

  test("Cancel closes the dialog without calling the API", () => {
    render(<SecurityPanel />);
    fireEvent.click(screen.getByTestId("security-force-logout-open"));
    fireEvent.click(screen.getByTestId("security-force-logout-cancel"));
    expect(screen.queryByTestId("security-force-logout-confirm")).not.toBeInTheDocument();
    expect(forceLogoutAllUsers).not.toHaveBeenCalled();
  });

  test("confirming calls forceLogoutAllUsers and shows the success message", async () => {
    forceLogoutAllUsers.mockResolvedValue({ total_invalidated: 7 });
    render(<SecurityPanel />);
    fireEvent.click(screen.getByTestId("security-force-logout-open"));
    fireEvent.click(screen.getByTestId("security-force-logout-confirm-btn"));

    await waitFor(() => expect(forceLogoutAllUsers).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("security-force-logout-success")).toHaveTextContent("7 sessions");
    // Dialog closes on success.
    expect(screen.queryByTestId("security-force-logout-confirm")).not.toBeInTheDocument();
  });

  test("a single invalidated session uses singular copy", async () => {
    forceLogoutAllUsers.mockResolvedValue({ total_invalidated: 1 });
    render(<SecurityPanel />);
    fireEvent.click(screen.getByTestId("security-force-logout-open"));
    fireEvent.click(screen.getByTestId("security-force-logout-confirm-btn"));
    expect(await screen.findByTestId("security-force-logout-success")).toHaveTextContent("1 session");
    expect(screen.getByTestId("security-force-logout-success")).not.toHaveTextContent("1 sessions");
  });

  test("proactively signs the admin's own session out after success", async () => {
    jest.useFakeTimers();
    forceLogoutAllUsers.mockResolvedValue({ total_invalidated: 3 });
    render(<SecurityPanel />);
    fireEvent.click(screen.getByTestId("security-force-logout-open"));
    fireEvent.click(screen.getByTestId("security-force-logout-confirm-btn"));

    await waitFor(() => expect(forceLogoutAllUsers).toHaveBeenCalledTimes(1));
    expect(signOut).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(signOut).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test("shows an error and never signs the admin out on failure", async () => {
    forceLogoutAllUsers.mockRejectedValue(new Error("Network error"));
    render(<SecurityPanel />);
    fireEvent.click(screen.getByTestId("security-force-logout-open"));
    fireEvent.click(screen.getByTestId("security-force-logout-confirm-btn"));

    expect(await screen.findByTestId("security-force-logout-error")).toHaveTextContent("Network error");
    expect(signOut).not.toHaveBeenCalled();
  });

  test("does not call the API merely by rendering — no accidental trigger", () => {
    render(<SecurityPanel />);
    expect(forceLogoutAllUsers).not.toHaveBeenCalled();
  });
});
