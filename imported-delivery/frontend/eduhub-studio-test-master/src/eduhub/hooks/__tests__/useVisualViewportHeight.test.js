import { render, screen, act } from "@testing-library/react";
import useVisualViewportHeight from "../useVisualViewportHeight";

// Inline fake visualViewport — mirrors the established codebase pattern
// (jsdom has no real VisualViewport implementation), same fake shape
// useVisualViewportKeyboard.test.js already uses.
class FakeVisualViewport {
  constructor() {
    this.height = 800;
    this._listeners = {};
  }
  addEventListener(type, fn) {
    this._listeners[type] = this._listeners[type] || [];
    this._listeners[type].push(fn);
  }
  removeEventListener(type, fn) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
  }
  fire(type) {
    (this._listeners[type] || []).forEach((fn) => fn());
  }
}

function Harness() {
  const h = useVisualViewportHeight();
  return <div data-testid="height">{String(h)}</div>;
}

let fakeVv;

beforeEach(() => {
  fakeVv = new FakeVisualViewport();
  window.visualViewport = fakeVv;
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
});

afterEach(() => {
  delete window.visualViewport;
});

test("reports the real visualViewport height on mount, not window.innerHeight", () => {
  fakeVv.height = 800;
  render(<Harness />);
  expect(screen.getByTestId("height")).toHaveTextContent("800");
});

test("updates live when the keyboard opens and visualViewport.height shrinks", () => {
  render(<Harness />);
  act(() => {
    fakeVv.height = 420; // keyboard covering ~380px
    fakeVv.fire("resize");
  });
  expect(screen.getByTestId("height")).toHaveTextContent("420");
});

test("also updates on the visualViewport scroll event (e.g. Safari's keyboard-open scroll adjustment)", () => {
  render(<Harness />);
  act(() => {
    fakeVv.height = 500;
    fakeVv.fire("scroll");
  });
  expect(screen.getByTestId("height")).toHaveTextContent("500");
});

test("returns to the full height once the keyboard dismisses", () => {
  render(<Harness />);
  act(() => {
    fakeVv.height = 420;
    fakeVv.fire("resize");
  });
  expect(screen.getByTestId("height")).toHaveTextContent("420");
  act(() => {
    fakeVv.height = 800;
    fakeVv.fire("resize");
  });
  expect(screen.getByTestId("height")).toHaveTextContent("800");
});

test("falls back to window.innerHeight when visualViewport is unavailable, never throws", () => {
  delete window.visualViewport;
  expect(() => render(<Harness />)).not.toThrow();
  expect(screen.getByTestId("height")).toHaveTextContent("800");
});

test("falls back to window resize events when visualViewport is unavailable", () => {
  delete window.visualViewport;
  render(<Harness />);
  act(() => {
    Object.defineProperty(window, "innerHeight", { value: 500, configurable: true });
    window.dispatchEvent(new Event("resize"));
  });
  expect(screen.getByTestId("height")).toHaveTextContent("500");
});
