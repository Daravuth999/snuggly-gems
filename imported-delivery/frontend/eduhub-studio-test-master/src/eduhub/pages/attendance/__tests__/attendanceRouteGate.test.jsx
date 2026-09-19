import { render, screen } from "@testing-library/react";
import AttendanceRouteGate from "../AttendanceRouteGate";
import { getV2Status } from "../api";

jest.mock("../api", () => ({
  getV2Status: jest.fn(),
}));

// Both real pages do their own data fetching (useAttendance, getMonthlySummary,
// etc.) — this test is only about which ONE the gate picks, so both are
// replaced with a stub that renders a single identifying marker. Neither
// mock needs a Router ancestor, and AttendanceRouteGate itself doesn't use
// any router hooks directly, so no MemoryRouter wrapper is needed here
// (react-router-dom isn't Jest-resolvable in this project — see the
// existing jest.mock("react-router-dom", ...) precedent in
// voiceTreasure_passB21.mounted.test.jsx).
jest.mock("../ConstellationView", () => () => <div data-testid="legacy-view" />);
jest.mock("../AttendanceOverview", () => () => <div data-testid="v2-view" />);

function renderGate() {
  return render(<AttendanceRouteGate />);
}

describe("AttendanceRouteGate", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows a checking state before the flag resolves", () => {
    getV2Status.mockReturnValue(new Promise(() => {})); // never resolves
    renderGate();
    expect(screen.getByTestId("attendance-gate-checking")).toBeInTheDocument();
    expect(screen.queryByTestId("legacy-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("v2-view")).not.toBeInTheDocument();
  });

  test("renders the legacy ConstellationView when v2 is disabled", async () => {
    getV2Status.mockResolvedValue({ enabled: false });
    renderGate();
    expect(await screen.findByTestId("legacy-view")).toBeInTheDocument();
    expect(screen.queryByTestId("v2-view")).not.toBeInTheDocument();
  });

  test("renders AttendanceOverview when v2 is enabled", async () => {
    getV2Status.mockResolvedValue({ enabled: true });
    renderGate();
    expect(await screen.findByTestId("v2-view")).toBeInTheDocument();
    expect(screen.queryByTestId("legacy-view")).not.toBeInTheDocument();
  });

  test("defaults to legacy on a malformed response (fail-closed)", async () => {
    getV2Status.mockResolvedValue({});
    renderGate();
    expect(await screen.findByTestId("legacy-view")).toBeInTheDocument();
  });
});
