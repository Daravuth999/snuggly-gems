/**
 * StudentCheckIn.test.jsx — covers the Smart Login integration added to the
 * Class Gate check-in page (the P0 fix: students shouldn't have to retype
 * ID/password on every shared class link when the existing QR-based Smart
 * Login mechanism can authenticate them instead). Does not attempt full
 * coverage of the pre-existing check-in state machine — this component had
 * no test file before this change.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StudentCheckIn from "../StudentCheckIn";
import attendanceApi from "../api";
import { studentLogin, smartLogin } from "../../../auth/studentAuthService";

jest.mock("../api", () => ({
  __esModule: true,
  default: {
    getSessionBySlug: jest.fn(),
    checkinWithRetry: jest.fn(),
  },
}));

jest.mock("../../../auth/studentAuthService", () => ({
  studentLogin: jest.fn(),
  smartLogin: jest.fn(),
}));

jest.mock("../../../auth/SmartLoginPanel", () => ({
  __esModule: true,
  default: ({ onDecoded }) => (
    <button type="button" data-testid="mock-smart-scan" onClick={() => onDecoded("QR:mock-payload")}>
      Simulate scan
    </button>
  ),
}));

jest.mock("../../../auth/TurnstileWidget", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({ getToken: () => "", reset: () => {} }));
      return null;
    }),
  };
});

jest.mock("react-router-dom", () => ({
  __esModule: true,
  useParams: () => ({ slug: "abc123" }),
}), { virtual: true });

const unauthorized = Object.assign(new Error("Not authenticated"), { status: 401 });

describe("StudentCheckIn — Smart Login integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("an unauthenticated visit shows the login method toggle, defaulting to ID & Password", async () => {
    attendanceApi.getSessionBySlug.mockRejectedValue(unauthorized);
    render(<StudentCheckIn />);
    await screen.findByTestId("checkin-login");
    expect(screen.getByTestId("checkin-login-method-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("checkin-login-id")).toBeInTheDocument();
    expect(screen.queryByTestId("checkin-login-smart")).not.toBeInTheDocument();
  });

  test("switching to Smart Login shows the QR panel instead of the password form", async () => {
    attendanceApi.getSessionBySlug.mockRejectedValue(unauthorized);
    render(<StudentCheckIn />);
    await screen.findByTestId("checkin-login");
    fireEvent.click(screen.getByTestId("checkin-login-method-smart"));
    expect(screen.getByTestId("checkin-login-smart")).toBeInTheDocument();
    expect(screen.queryByTestId("checkin-login-id")).not.toBeInTheDocument();
  });

  test("a successful QR decode calls smartLogin (the SAME session mechanism as the password path) and re-loads the session", async () => {
    attendanceApi.getSessionBySlug
      .mockRejectedValueOnce(unauthorized)
      .mockResolvedValueOnce({ session_id: "ses_1", title_en: "English Speaking" });
    smartLogin.mockResolvedValue({ session_token: "tok_abc" });

    render(<StudentCheckIn />);
    await screen.findByTestId("checkin-login");
    fireEvent.click(screen.getByTestId("checkin-login-method-smart"));
    fireEvent.click(screen.getByTestId("mock-smart-scan"));

    await waitFor(() => expect(smartLogin).toHaveBeenCalledWith({ qrPayload: "QR:mock-payload", turnstileToken: "" }));
    // loadSession() re-runs after a successful smart login, exactly as it
    // does after a successful password login — never a full-page redirect.
    await waitFor(() => expect(attendanceApi.getSessionBySlug).toHaveBeenCalledTimes(2));
    expect(studentLogin).not.toHaveBeenCalled();
  });

  test("a failed QR decode shows an inline error and never touches the password path", async () => {
    attendanceApi.getSessionBySlug.mockRejectedValue(unauthorized);
    smartLogin.mockRejectedValue(new Error("QR code not recognized"));

    render(<StudentCheckIn />);
    await screen.findByTestId("checkin-login");
    fireEvent.click(screen.getByTestId("checkin-login-method-smart"));
    fireEvent.click(screen.getByTestId("mock-smart-scan"));

    expect(await screen.findByTestId("checkin-login-smart-error")).toHaveTextContent("QR code not recognized");
    expect(studentLogin).not.toHaveBeenCalled();
  });
});
