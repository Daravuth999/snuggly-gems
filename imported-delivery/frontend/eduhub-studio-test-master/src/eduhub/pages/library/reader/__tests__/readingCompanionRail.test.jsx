/**
 * readingCompanionRail.test.jsx — coverage for the Reading Companion rail
 * that replaced ReadingHub.jsx's tap-to-reveal bubble: Live Coach and
 * EduTalk must now be two independent, always-visible controls, each
 * gated on its own `visible` flag, each calling its own `onOpen` by
 * identity — never merged behind one generic microphone trigger.
 *
 * framer-motion is mocked the same way readingHub.test.jsx (its
 * predecessor) mocked it: motion.* as passthrough elements and
 * AnimatePresence as a plain fragment, since jsdom never runs real
 * animation frames.
 */
import { render, screen, fireEvent, act } from "@testing-library/react";

let mockReducedMotion = false;
jest.mock("framer-motion", () => {
  const React = require("react");
  const passthrough = (tag) =>
    React.forwardRef(({ children, initial, animate, exit, transition, whileHover, whileFocus, whileTap, ...rest }, ref) =>
      React.createElement(tag, { ref, ...rest }, children));
  return {
    motion: new Proxy({}, { get: (_t, tag) => passthrough(tag) }),
    AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
    useReducedMotion: () => mockReducedMotion,
  };
});

import ReadingCompanionRail from "../ReadingCompanionRail";

const INTRO_KEY = "eduhub_reading_companion_intro_seen";

beforeEach(() => {
  mockReducedMotion = false;
  window.localStorage.clear();
  jest.useFakeTimers();
});
afterEach(() => {
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

describe("ReadingCompanionRail — visibility gating", () => {
  test("renders nothing when neither module is visible", () => {
    render(<ReadingCompanionRail eduTalk={null} liveCoach={null} />);
    expect(screen.queryByTestId("companion-rail")).not.toBeInTheDocument();
  });

  test("renders nothing while celebrating, even if both modules are visible", () => {
    render(
      <ReadingCompanionRail
        eduTalk={{ visible: true, onOpen: jest.fn() }}
        liveCoach={{ visible: true, onOpen: jest.fn() }}
        celebrating
      />
    );
    expect(screen.queryByTestId("companion-rail")).not.toBeInTheDocument();
  });

  test("EduTalk alone renders only the EduTalk button", () => {
    render(<ReadingCompanionRail eduTalk={{ visible: true, onOpen: jest.fn() }} liveCoach={{ visible: false }} />);
    expect(screen.getByTestId("companion-rail-edutalk")).toBeInTheDocument();
    expect(screen.queryByTestId("companion-rail-livecoach")).not.toBeInTheDocument();
  });

  test("Live Coach alone renders only the Live Coach button", () => {
    render(<ReadingCompanionRail eduTalk={{ visible: false }} liveCoach={{ visible: true, onOpen: jest.fn() }} />);
    expect(screen.getByTestId("companion-rail-livecoach")).toBeInTheDocument();
    expect(screen.queryByTestId("companion-rail-edutalk")).not.toBeInTheDocument();
  });

  test("both visible renders both, Live Coach before EduTalk in DOM order", () => {
    render(
      <ReadingCompanionRail
        eduTalk={{ visible: true, onOpen: jest.fn() }}
        liveCoach={{ visible: true, onOpen: jest.fn() }}
      />
    );
    const rail = screen.getByTestId("companion-rail");
    const coach = screen.getByTestId("companion-rail-livecoach");
    const talk = screen.getByTestId("companion-rail-edutalk");
    expect(rail).toContainElement(coach);
    expect(rail).toContainElement(talk);
    // eslint-disable-next-line testing-library/no-node-access
    const position = coach.compareDocumentPosition(talk);
    // eslint-disable-next-line no-bitwise
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("a module's own button disappears the instant its overlay takes over (visible flips false), the other stays", () => {
    const { rerender } = render(
      <ReadingCompanionRail
        eduTalk={{ visible: true, onOpen: jest.fn() }}
        liveCoach={{ visible: true, onOpen: jest.fn() }}
      />
    );
    expect(screen.getByTestId("companion-rail-livecoach")).toBeInTheDocument();
    rerender(
      <ReadingCompanionRail
        eduTalk={{ visible: true, onOpen: jest.fn() }}
        liveCoach={{ visible: false }}
      />
    );
    expect(screen.queryByTestId("companion-rail-livecoach")).not.toBeInTheDocument();
    expect(screen.getByTestId("companion-rail-edutalk")).toBeInTheDocument();
  });
});

describe("ReadingCompanionRail — identity-preserved callbacks", () => {
  test("tapping Live Coach calls the exact onOpen reference passed in", () => {
    const onOpen = jest.fn();
    render(<ReadingCompanionRail eduTalk={null} liveCoach={{ visible: true, onOpen }} />);
    fireEvent.click(screen.getByTestId("companion-rail-livecoach"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test("tapping EduTalk calls the exact onOpen reference passed in", () => {
    const onOpen = jest.fn();
    render(<ReadingCompanionRail eduTalk={{ visible: true, onOpen }} liveCoach={null} />);
    fireEvent.click(screen.getByTestId("companion-rail-edutalk"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test("a missing onOpen never throws on tap", () => {
    render(<ReadingCompanionRail eduTalk={{ visible: true }} liveCoach={null} />);
    expect(() => fireEvent.click(screen.getByTestId("companion-rail-edutalk"))).not.toThrow();
  });
});

describe("ReadingCompanionRail — active state", () => {
  test("data-active reflects isActive per module independently", () => {
    render(
      <ReadingCompanionRail
        eduTalk={{ visible: true, isActive: true, onOpen: jest.fn() }}
        liveCoach={{ visible: true, isActive: false, onOpen: jest.fn() }}
      />
    );
    expect(screen.getByTestId("companion-rail-edutalk")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("companion-rail-livecoach")).toHaveAttribute("data-active", "false");
  });
});

describe("ReadingCompanionRail — accessibility", () => {
  test("every rendered button has an accessible name naming its own feature", () => {
    render(
      <ReadingCompanionRail
        eduTalk={{ visible: true, onOpen: jest.fn() }}
        liveCoach={{ visible: true, onOpen: jest.fn() }}
      />
    );
    expect(screen.getByRole("button", { name: "Live Coach" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EduTalk" })).toBeInTheDocument();
  });
});

describe("ReadingCompanionRail — first-time discovery hint", () => {
  test("shows once, after a delay, then auto-dismisses and persists the flag", () => {
    render(<ReadingCompanionRail eduTalk={{ visible: true, onOpen: jest.fn() }} liveCoach={null} />);
    expect(screen.queryByTestId("companion-rail-intro")).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1100));
    expect(screen.getByTestId("companion-rail-intro")).toBeInTheDocument();
    expect(screen.getByText("Your reading companions")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(5000));
    expect(screen.queryByTestId("companion-rail-intro")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(INTRO_KEY)).toBe("1");
  });

  test("never shows again once the device flag is already set", () => {
    window.localStorage.setItem(INTRO_KEY, "1");
    render(<ReadingCompanionRail eduTalk={{ visible: true, onOpen: jest.fn() }} liveCoach={null} />);
    act(() => jest.advanceTimersByTime(5000));
    expect(screen.queryByTestId("companion-rail-intro")).not.toBeInTheDocument();
  });

  test("Escape dismisses the hint immediately and persists the flag", () => {
    render(<ReadingCompanionRail eduTalk={{ visible: true, onOpen: jest.fn() }} liveCoach={null} />);
    act(() => jest.advanceTimersByTime(1100));
    expect(screen.getByTestId("companion-rail-intro")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("companion-rail-intro")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(INTRO_KEY)).toBe("1");
  });
});

describe("ReadingCompanionRail — reduced motion", () => {
  test("still renders both controls with reduced motion enabled", () => {
    mockReducedMotion = true;
    render(
      <ReadingCompanionRail
        eduTalk={{ visible: true, onOpen: jest.fn() }}
        liveCoach={{ visible: true, onOpen: jest.fn() }}
      />
    );
    expect(screen.getByTestId("companion-rail-livecoach")).toBeInTheDocument();
    expect(screen.getByTestId("companion-rail-edutalk")).toBeInTheDocument();
  });
});
