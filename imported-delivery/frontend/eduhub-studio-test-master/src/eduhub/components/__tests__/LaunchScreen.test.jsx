import { render, screen } from "@testing-library/react";
import LaunchScreen from "../LaunchScreen";

describe("LaunchScreen", () => {
  test("renders the EDUHUB and STUDIO brand identity, not a generic loading indicator", () => {
    render(<LaunchScreen />);
    const root = screen.getByTestId("eduhub-launch-screen");
    expect(root).toHaveTextContent("EDUHUB");
    expect(root).toHaveTextContent("STUDIO");
    // No spinner/progress-bar role — this is a brand moment, not a loader.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  test("is announced accessibly as a loading state without visually saying 'Loading'", () => {
    render(<LaunchScreen />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading EduHub Studio");
  });
});
