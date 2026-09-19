/**
 * MessagingBell.test.jsx — header nav entry point for in-app messaging.
 *
 * Rule 8.2's core guarantee: FULLY OMITTED (not shown disabled) when
 * the feature is off. Also proves it's a distinct icon from the
 * Activity Center bell, and exercises the v3 failure-proofing that
 * followed a real invisible-icon regression: a real browser test
 * against lottie-web proved `autoplay:false` renders NOTHING until an
 * imperative `playSegments` call succeeds — so the idle state must be
 * provable as fully declarative (autoplay+loop+initialSegment), never
 * dependent on any effect actually firing, and a render-time throw
 * from the third-party player must fall back to the exact same static
 * icon via a real error boundary, not a blank space.
 *
 * lottie-react's underlying lottie-web engine touches a 2D canvas
 * context at MODULE LOAD time, which jsdom does not implement —
 * importing the real package crashes test collection outright (same
 * reason ChampionShimmer.test.jsx, the sibling component this file's
 * fallback contract mirrors, mocks it too).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MessagingBell from "../MessagingBell";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  __esModule: true,
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock("lottie-react", () => {
  const playSegmentsCalls = [];
  const fakeInstance = {
    animationItem: { loop: true },
    playSegments: (segment, forceFlag) => {
      playSegmentsCalls.push({ segment, forceFlag, loopAtCallTime: fakeInstance.animationItem.loop });
    },
  };
  let lastOnComplete = null;
  let lastProps = null;
  let shouldThrow = false;
  function MockLottie(props) {
    if (shouldThrow) throw new Error("simulated lottie-react render crash");
    if (props.lottieRef) props.lottieRef.current = fakeInstance;
    lastOnComplete = props.onComplete || null;
    lastProps = props;
    return <div data-testid="messaging-bell-lottie-mock" />;
  }
  return {
    __esModule: true,
    default: MockLottie,
    __playSegmentsCalls: playSegmentsCalls,
    __fakeInstance: fakeInstance,
    __triggerComplete: () => { if (lastOnComplete) lastOnComplete(); },
    __lastProps: () => lastProps,
    __setShouldThrow: (v) => { shouldThrow = v; },
  };
});

const lottieMock = jest.requireMock("lottie-react");

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

let mockCtx = null;
jest.mock("../../../context/MessagingContext", () => ({
  useMessaging: () => mockCtx,
}));

function renderBell() {
  return render(<MessagingBell />);
}

beforeEach(() => {
  lottieMock.__playSegmentsCalls.length = 0;
  lottieMock.__fakeInstance.animationItem.loop = true;
  lottieMock.__setShouldThrow(false);
  mockMatchMedia(false);
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ v: "5.7.4", layers: [] }) }),
  );
});

afterEach(() => {
  delete global.fetch;
});

test("renders nothing while the context has not mounted at all", () => {
  mockCtx = null;
  const { container } = renderBell();
  expect(container).toBeEmptyDOMElement();
});

test("renders nothing while enabled is still being checked (null) — rule 8.2, never a flash", () => {
  mockCtx = { enabled: null, unreadCount: 0, lastArrival: null };
  const { container } = renderBell();
  expect(container).toBeEmptyDOMElement();
});

test("renders nothing when the feature is confirmed off — fully omitted, not disabled", () => {
  mockCtx = { enabled: false, unreadCount: 0, lastArrival: null };
  const { container } = renderBell();
  expect(container).toBeEmptyDOMElement();
});

test("renders the real Lottie player with no badge when enabled and there is nothing unread", async () => {
  mockCtx = { enabled: true, unreadCount: 0, lastArrival: null };
  renderBell();
  expect(screen.getByTestId("messaging-bell-btn")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId("messaging-bell-lottie-mock")).toBeInTheDocument());
  expect(screen.queryByTestId("messaging-bell-badge")).not.toBeInTheDocument();
});

test("renders the real unread count as a badge when enabled and there is unread activity", () => {
  mockCtx = { enabled: true, unreadCount: 3, lastArrival: null };
  renderBell();
  expect(screen.getByTestId("messaging-bell-badge")).toHaveTextContent("3");
});

test("caps a very large unread count display at 99+", () => {
  mockCtx = { enabled: true, unreadCount: 250, lastArrival: null };
  renderBell();
  expect(screen.getByTestId("messaging-bell-badge")).toHaveTextContent("99+");
});

test("clicking the icon navigates to the inbox — unaffected by the Lottie redesign", () => {
  mockCtx = { enabled: true, unreadCount: 0, lastArrival: null };
  renderBell();
  fireEvent.click(screen.getByTestId("messaging-bell-btn"));
  expect(mockNavigate).toHaveBeenCalledWith("/messages");
});

test("regression: falls back to the static, light/dark-aware icon under prefers-reduced-motion (never fetches)", () => {
  mockMatchMedia(true);
  mockCtx = { enabled: true, unreadCount: 0, lastArrival: null };
  renderBell();
  const fallback = screen.getByTestId("messaging-bell-fallback");
  expect(fallback.className).toMatch(/\btext-ink\b/);
  expect(fallback.className).not.toMatch(/(^|\s)text-white\/80\b/);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("falls back to the static icon when the Lottie JSON fetch fails", async () => {
  global.fetch = jest.fn(() => Promise.reject(new Error("network down")));
  mockCtx = { enabled: true, unreadCount: 0, lastArrival: null };
  renderBell();
  await waitFor(() => expect(screen.getByTestId("messaging-bell-fallback")).toBeInTheDocument());
});

test("falls back to the static icon when the Lottie JSON 404s", async () => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: false }));
  mockCtx = { enabled: true, unreadCount: 0, lastArrival: null };
  renderBell();
  await waitFor(() => expect(screen.getByTestId("messaging-bell-fallback")).toBeInTheDocument());
});

test("regression: the idle state is fully declarative (autoplay+loop+initialSegment), never dependent on an imperative call ever firing", async () => {
  // The actual bug: v2 relied SOLELY on a useEffect finding a populated
  // lottieRef after mount to call playSegments — proven in a real
  // browser that autoplay:false renders NOTHING until that succeeds.
  // If this test only checked playSegments was called, it would NOT
  // have caught that regression (the effect firing and the icon being
  // visible are two different things when autoplay is what actually
  // controls visibility). Asserting the declarative props themselves
  // is what makes this a real regression test for the actual root
  // cause, not just the symptom.
  mockCtx = { enabled: true, unreadCount: 0, lastArrival: null };
  renderBell();
  await waitFor(() => expect(lottieMock.__lastProps()).not.toBeNull());
  const props = lottieMock.__lastProps();
  expect(props.autoplay).toBe(true);
  expect(props.loop).toBe(true);
  expect(props.initialSegment).toEqual([0, 90]);
});

test("a genuine new arrival plays the non-looping burst segment, then resumes the idle loop on complete", async () => {
  mockCtx = { enabled: true, unreadCount: 0, lastArrival: null };
  const { rerender } = renderBell();
  await waitFor(() => expect(lottieMock.__lastProps()).not.toBeNull());

  mockCtx = { enabled: true, unreadCount: 1, lastArrival: { id: "m1" } };
  rerender(<MessagingBell />);

  await waitFor(() => expect(lottieMock.__playSegmentsCalls.length).toBeGreaterThan(0));
  const burstCall = lottieMock.__playSegmentsCalls[lottieMock.__playSegmentsCalls.length - 1];
  expect(burstCall.segment).toEqual([90, 135]);
  expect(lottieMock.__fakeInstance.animationItem.loop).toBe(false);

  lottieMock.__playSegmentsCalls.length = 0;
  lottieMock.__triggerComplete();

  expect(lottieMock.__fakeInstance.animationItem.loop).toBe(true);
  expect(lottieMock.__playSegmentsCalls[0].segment).toEqual([0, 90]);
});

test("regression: falls back to the static icon if lottie-react throws while rendering, instead of taking the header down", async () => {
  lottieMock.__setShouldThrow(true);
  mockCtx = { enabled: true, unreadCount: 0, lastArrival: null };
  // eslint-disable-next-line no-console -- React logs the caught error; expected here.
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  renderBell();
  await waitFor(() => expect(screen.getByTestId("messaging-bell-fallback")).toBeInTheDocument());
  expect(screen.getByTestId("messaging-bell-btn")).toBeInTheDocument();
  spy.mockRestore();
});
