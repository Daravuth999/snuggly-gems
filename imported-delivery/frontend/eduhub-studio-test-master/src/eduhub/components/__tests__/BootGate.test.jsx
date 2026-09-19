/**
 * BootGate.test.jsx — the fix for "closing and reopening the PWA sometimes
 * shows an old Home Dashboard first": the app tree must never mount before
 * checkBootVersion() resolves, and a "reload" outcome must never render
 * children at all.
 */
import { render, screen, waitFor } from "@testing-library/react";
import BootGate from "../BootGate";

jest.mock("../LaunchScreen", () => () => <div data-testid="mock-launch-screen" />);
jest.mock("../../lib/bootVersionGate", () => ({
  checkBootVersion: jest.fn(),
  reloadForLatestVersion: jest.fn(),
}));

import { checkBootVersion, reloadForLatestVersion } from "../../lib/bootVersionGate";

describe("BootGate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("shows the launch screen and withholds children while the version check is pending", async () => {
    let resolveCheck;
    checkBootVersion.mockReturnValue(new Promise((r) => { resolveCheck = r; }));
    render(<BootGate><div data-testid="app-content">App</div></BootGate>);
    expect(screen.getByTestId("mock-launch-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("app-content")).not.toBeInTheDocument();
    resolveCheck("current"); // avoid an unresolved promise leaking into the next test
  });

  test("renders children once the check resolves 'current'", async () => {
    checkBootVersion.mockResolvedValue("current");
    render(<BootGate><div data-testid="app-content">App</div></BootGate>);
    await waitFor(() => expect(screen.getByTestId("app-content")).toBeInTheDocument(), { timeout: 2000 });
    expect(reloadForLatestVersion).not.toHaveBeenCalled();
  });

  test("renders children once the check resolves 'unknown' (offline/timeout) — never hangs waiting for a perfect verification", async () => {
    checkBootVersion.mockResolvedValue("unknown");
    render(<BootGate><div data-testid="app-content">App</div></BootGate>);
    await waitFor(() => expect(screen.getByTestId("app-content")).toBeInTheDocument(), { timeout: 2000 });
  });

  test("on 'reload', triggers reloadForLatestVersion and NEVER renders the stale app tree", async () => {
    checkBootVersion.mockResolvedValue("reload");
    render(<BootGate><div data-testid="app-content">App</div></BootGate>);
    await waitFor(() => expect(reloadForLatestVersion).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("app-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-launch-screen")).toBeInTheDocument();
  });
});
