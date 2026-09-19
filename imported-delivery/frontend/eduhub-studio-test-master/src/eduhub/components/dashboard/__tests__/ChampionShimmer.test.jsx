/**
 * ChampionShimmer.test.jsx — Dashboard Polish Round 2, Feature 1.
 * Mirrors the bulletproof-fallback contract this component documents:
 * reduced-motion and any fetch failure must both resolve to the static
 * CSS glow, never a crash and never a blocked render.
 */
import { render, screen, waitFor } from "@testing-library/react";
import ChampionShimmer from "../ChampionShimmer";

// lottie-react's underlying lottie-web engine touches a 2D canvas context
// at MODULE LOAD time, which jsdom does not implement — importing the real
// package crashes test collection outright (this is the same reason
// TopUpLottie.jsx, the sibling component this one's fallback contract
// mirrors, has never had a render test in this codebase either). Mocked
// here rather than left untested, since this file's whole point is
// proving the fallback-vs-real-player branch logic.
jest.mock("lottie-react", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-lottie-player" />,
}));

function mockMatchMedia(reduced) {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: reduced,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  }));
}

afterEach(() => {
  delete global.fetch;
});

test("renders the static fallback glow immediately under prefers-reduced-motion, never fetching", () => {
  mockMatchMedia(true);
  global.fetch = jest.fn();
  render(<ChampionShimmer />);
  expect(screen.getByTestId("champion-shimmer-fallback")).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});

test("falls back to the static glow when the Lottie JSON fetch fails", async () => {
  mockMatchMedia(false);
  global.fetch = jest.fn(() => Promise.reject(new Error("network down")));
  render(<ChampionShimmer />);
  await waitFor(() => expect(screen.getByTestId("champion-shimmer-fallback")).toBeInTheDocument());
});

test("falls back to the static glow when the Lottie JSON 404s", async () => {
  mockMatchMedia(false);
  global.fetch = jest.fn(() => Promise.resolve({ ok: false }));
  render(<ChampionShimmer />);
  await waitFor(() => expect(screen.getByTestId("champion-shimmer-fallback")).toBeInTheDocument());
});

test("renders the Lottie player once a valid animation JSON resolves", async () => {
  mockMatchMedia(false);
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ v: "5.9.0", layers: [] }) }));
  render(<ChampionShimmer />);
  await waitFor(() => expect(screen.getByTestId("champion-shimmer-player")).toBeInTheDocument());
});
