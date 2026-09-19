/**
 * Tappable.test.jsx — Dashboard Polish Round 2, Feature 2's shared
 * affordance primitive. Confirms: it renders its children unmodified (so
 * wrapping never changes the underlying Link/button's own behavior), and
 * the idle shimmer cue is present when useAmbientActive reports active,
 * absent when it doesn't (e.g. under prefers-reduced-motion / off-screen /
 * hidden tab — exactly what that hook already gates for MyRankCard.jsx).
 */
import { render, screen, fireEvent } from "@testing-library/react";
import Tappable from "../Tappable";
import useAmbientActive from "../../hooks/useAmbientActive";

jest.mock("../../hooks/useAmbientActive");

beforeEach(() => {
  useAmbientActive.mockReturnValue({ ref: { current: null }, active: true });
});

test("renders its children exactly, without altering their own click behavior", () => {
  const onClick = jest.fn();
  render(
    <Tappable>
      <button onClick={onClick}>Open Library</button>
    </Tappable>,
  );
  fireEvent.click(screen.getByText("Open Library"));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("shows the idle affordance cue when useAmbientActive reports active", () => {
  useAmbientActive.mockReturnValue({ ref: { current: null }, active: true });
  render(<Tappable><button>Go</button></Tappable>);
  expect(screen.getByTestId("tappable-idle-cue")).toBeInTheDocument();
});

test("hides the idle affordance cue when useAmbientActive reports inactive (reduced motion / off-screen / hidden tab)", () => {
  useAmbientActive.mockReturnValue({ ref: { current: null }, active: false });
  render(<Tappable><button>Go</button></Tappable>);
  expect(screen.queryByTestId("tappable-idle-cue")).not.toBeInTheDocument();
});

test("forwards a custom className onto the wrapper alongside the shared eh-tappable class", () => {
  render(<Tappable className="rounded-2xl overflow-hidden"><button>Go</button></Tappable>);
  expect(screen.getByTestId("tappable")).toHaveClass("eh-tappable", "rounded-2xl", "overflow-hidden");
});
