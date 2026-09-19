/**
 * PurchaseModal.test.jsx — the voucher-redemption UX redesign.
 *
 * Root-cause fix under test: the modal now renders via createPortal to
 * document.body at z-[500] instead of inline inside LibraryPage's own
 * z-10 stacking context, where its previous z-[70] could never actually
 * outrank the app shell's MobileBottomNav (z-[400]) — see the component's
 * own header comment. Also covers the new reason-aware full-panel states
 * (Initial/Validating/Success/AlreadyOwned/PromotionAlreadyRedeemed/
 * Invalid/Expired/AlreadyUsed/NetworkError) that replace the old single
 * generic failure panel.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

// react-router-dom isn't Jest-resolvable in this project (established
// convention — see EduTalkPanel.jsx's own tests); PurchaseModal only uses
// <Link> for the top-up CTA, so a minimal anchor stand-in is enough.
jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
}), { virtual: true });

import PurchaseModal from "../PurchaseModal.jsx";

const BOOK = { slug: "the-unexpected-opportunity", title: "The Unexpected Opportunity", price: 25 };

function baseProps(overrides = {}) {
  return {
    book: BOOK,
    meta: null,
    price: 25,
    balance: 100,
    error: null,
    errorReason: null,
    onCancel: jest.fn(),
    onConfirm: jest.fn(async () => {}),
    onFinished: jest.fn(),
    onOpenOwnedBook: jest.fn(),
    ...overrides,
  };
}

function mockFetchOnce(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  jest.restoreAllMocks();
  try { window.sessionStorage.clear(); } catch { /* ignore */ }
});

describe("PurchaseModal — root-cause visibility fix", () => {
  test("renders via a portal directly under document.body, not nested inside the render container", () => {
    const { container } = render(<PurchaseModal {...baseProps()} />);
    // The render container (RTL's default wrapper div) must be EMPTY —
    // the modal escaped it via createPortal.
    expect(container).toBeEmptyDOMElement();
    // ...but the modal IS in the document, as a portal child of <body>.
    const modal = screen.getByTestId("purchase-modal");
    expect(document.body.contains(modal)).toBe(true);
  });

  test("uses z-[500] — clears the app shell's Header (z-[200]) and MobileBottomNav (z-[400])", () => {
    render(<PurchaseModal {...baseProps()} />);
    expect(screen.getByTestId("purchase-modal").className).toMatch(/z-\[500\]/);
  });

  test("dialog is a proper aria dialog and receives focus on open", () => {
    render(<PurchaseModal {...baseProps()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(document.activeElement).toBe(dialog);
  });
});

describe("PurchaseModal — Initial state", () => {
  test("shows the book title, price, and balance", () => {
    render(<PurchaseModal {...baseProps()} />);
    expect(screen.getByTestId("purchase-title")).toHaveTextContent("The Unexpected Opportunity");
    expect(screen.getByTestId("purchase-price")).toHaveTextContent("25");
    expect(screen.getByTestId("purchase-balance")).toHaveTextContent("100");
  });

  test("Unlock CTA is disabled when the student can't afford it", () => {
    render(<PurchaseModal {...baseProps({ balance: 5 })} />);
    expect(screen.getByTestId("purchase-confirm")).toBeDisabled();
    expect(screen.getByTestId("purchase-topup-link")).toBeInTheDocument();
  });
});

describe("PurchaseModal — Validating + coupon outcomes", () => {
  test("Apply button shows a loading state and is disabled while validating", async () => {
    let resolveFetch;
    global.fetch = jest.fn(() => new Promise((res) => { resolveFetch = res; }));
    render(<PurchaseModal {...baseProps()} />);
    fireEvent.change(screen.getByTestId("coupon-input"), { target: { value: "SAVE20" } });
    fireEvent.click(screen.getByTestId("coupon-apply-btn"));
    await waitFor(() => expect(screen.getByTestId("coupon-apply-btn")).toBeDisabled());
    expect(screen.getByTestId("coupon-input")).toBeDisabled();
    act(() => resolveFetch({ ok: true, status: 200, json: async () => ({
      ok: true, original_price: 25, discounted_price: 20, discount_amount: 5,
      coupon_type: "percent", coupon_value: 20, code: "SAVE20",
    }) }));
    await waitFor(() => expect(screen.getByTestId("purchase-price-breakdown")).toBeInTheDocument());
  });

  test("a valid coupon shows the price breakdown with the backend-validated discount", async () => {
    mockFetchOnce(200, {
      ok: true, original_price: 25, discounted_price: 0, discount_amount: 25,
      coupon_type: "percent", coupon_value: 100, code: "LAUNCH100",
    });
    render(<PurchaseModal {...baseProps()} />);
    fireEvent.change(screen.getByTestId("coupon-input"), { target: { value: "LAUNCH100" } });
    fireEvent.click(screen.getByTestId("coupon-apply-btn"));
    await waitFor(() => expect(screen.getByTestId("purchase-price-breakdown")).toBeInTheDocument());
    expect(screen.getByTestId("purchase-price")).toHaveTextContent("0");
    expect(screen.getByTestId("purchase-confirm")).toHaveTextContent("Unlock for 0 pts");
  });

  test("an unknown/invalid code shows the Invalid Voucher panel, not a generic error", async () => {
    mockFetchOnce(404, { detail: { reason: "not_found", message: "Coupon code not found." } });
    render(<PurchaseModal {...baseProps()} />);
    fireEvent.change(screen.getByTestId("coupon-input"), { target: { value: "NOPE" } });
    fireEvent.click(screen.getByTestId("coupon-apply-btn"));
    await waitFor(() => expect(screen.getByTestId("purchase-error")).toBeInTheDocument());
    expect(screen.getByTestId("purchase-error")).toHaveAttribute("data-fail-reason", "not_found");
    expect(screen.getByText("Voucher code not found")).toBeInTheDocument();
  });

  test("an expired code shows the Expired Voucher panel", async () => {
    mockFetchOnce(400, { detail: { reason: "expired", message: "This coupon has expired." } });
    render(<PurchaseModal {...baseProps()} />);
    fireEvent.change(screen.getByTestId("coupon-input"), { target: { value: "OLD1" } });
    fireEvent.click(screen.getByTestId("coupon-apply-btn"));
    await waitFor(() => expect(screen.getByText("This voucher has expired")).toBeInTheDocument());
  });

  test("an already-used code shows the Already Used panel", async () => {
    mockFetchOnce(400, { detail: { reason: "already_used", message: "You have already used this coupon for this book." } });
    render(<PurchaseModal {...baseProps()} />);
    fireEvent.change(screen.getByTestId("coupon-input"), { target: { value: "ONCE1" } });
    fireEvent.click(screen.getByTestId("coupon-apply-btn"));
    await waitFor(() => expect(screen.getByText("Already used")).toBeInTheDocument());
  });

  test("a promotion already redeemed by this student shows a DISTINCT panel from Invalid Voucher", async () => {
    mockFetchOnce(409, {
      detail: {
        reason: "promotion_already_redeemed",
        message: "You've already redeemed this promotional offer. It can only be used once per account.",
      },
    });
    render(<PurchaseModal {...baseProps()} />);
    fireEvent.change(screen.getByTestId("coupon-input"), { target: { value: "LAUNCH100" } });
    fireEvent.click(screen.getByTestId("coupon-apply-btn"));
    await waitFor(() => expect(screen.getByTestId("purchase-error")).toHaveAttribute("data-fail-reason", "promotion_already_redeemed"));
    expect(screen.getByText("Offer already redeemed")).toBeInTheDocument();
    expect(screen.queryByText("Voucher code not found")).toBeNull();
    expect(screen.getByTestId("purchase-error-primary")).toHaveTextContent("Continue without a voucher");
  });

  test("'Try another code' from a failed voucher state clears the code and returns to Initial", async () => {
    mockFetchOnce(404, { detail: { reason: "not_found", message: "Coupon code not found." } });
    render(<PurchaseModal {...baseProps()} />);
    fireEvent.change(screen.getByTestId("coupon-input"), { target: { value: "NOPE" } });
    fireEvent.click(screen.getByTestId("coupon-apply-btn"));
    await waitFor(() => screen.getByTestId("purchase-error-primary"));
    fireEvent.click(screen.getByTestId("purchase-error-primary"));
    await waitFor(() => expect(screen.getByTestId("coupon-input")).toBeInTheDocument());
    expect(screen.getByTestId("coupon-input").value).toBe("");
  });

  test("a network failure while validating shows the Network Error panel with Try again", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    render(<PurchaseModal {...baseProps()} />);
    fireEvent.change(screen.getByTestId("coupon-input"), { target: { value: "ANY" } });
    fireEvent.click(screen.getByTestId("coupon-apply-btn"));
    await waitFor(() => expect(screen.getByText("Couldn't connect")).toBeInTheDocument());
    expect(screen.getByTestId("purchase-error-primary")).toHaveTextContent("Try again");
  });

  test("an unexpected/malformed API response never leaves the modal blank", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error("bad json"); } });
    render(<PurchaseModal {...baseProps()} />);
    fireEvent.change(screen.getByTestId("coupon-input"), { target: { value: "ANY" } });
    fireEvent.click(screen.getByTestId("coupon-apply-btn"));
    await waitFor(() => expect(screen.getByTestId("purchase-error")).toBeInTheDocument());
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});

describe("PurchaseModal — Success", () => {
  test("a successful purchase shows the celebration and an explicit Open Book CTA", async () => {
    const onConfirm = jest.fn(async () => {});
    render(<PurchaseModal {...baseProps({ onConfirm })} />);
    await act(async () => { fireEvent.click(screen.getByTestId("purchase-confirm")); });
    await waitFor(() => expect(screen.getByTestId("purchase-success")).toBeInTheDocument());
    expect(screen.getByTestId("purchase-open-book")).toBeInTheDocument();
  });

  test("clicking Open Book fires onFinished immediately (does not wait for the auto-advance timer)", async () => {
    const onFinished = jest.fn();
    const onConfirm = jest.fn(async () => {});
    render(<PurchaseModal {...baseProps({ onConfirm, onFinished })} />);
    await act(async () => { fireEvent.click(screen.getByTestId("purchase-confirm")); });
    await waitFor(() => screen.getByTestId("purchase-open-book"));
    fireEvent.click(screen.getByTestId("purchase-open-book"));
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  test("clicking Unlock twice in quick succession only calls onConfirm once", async () => {
    const onConfirm = jest.fn(async () => new Promise((r) => setTimeout(r, 50)));
    render(<PurchaseModal {...baseProps({ onConfirm })} />);
    const btn = screen.getByTestId("purchase-confirm");
    fireEvent.click(btn);
    fireEvent.click(btn); // the "Deducting…" phase guard should swallow this
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });
});

describe("PurchaseModal — Already Owned (from the parent's error/errorReason props)", () => {
  test("shows the Already Owned panel — never a generic failure — with an Open Book CTA", () => {
    render(<PurchaseModal {...baseProps({
      error: "You already own this book.", errorReason: "already_owned",
    })} />);
    expect(screen.getByText("You already own this book")).toBeInTheDocument();
    expect(screen.getByTestId("purchase-error-primary")).toHaveTextContent("Open Book");
  });

  test("Open Book calls onOpenOwnedBook, not onFinished", () => {
    const onOpenOwnedBook = jest.fn();
    const onFinished = jest.fn();
    render(<PurchaseModal {...baseProps({
      error: "You already own this book.", errorReason: "already_owned",
      onOpenOwnedBook, onFinished,
    })} />);
    fireEvent.click(screen.getByTestId("purchase-error-primary"));
    expect(onOpenOwnedBook).toHaveBeenCalledTimes(1);
    expect(onFinished).not.toHaveBeenCalled();
  });
});

describe("PurchaseModal — keyboard + close behavior", () => {
  test("Escape closes the modal while idle", () => {
    const onCancel = jest.fn();
    render(<PurchaseModal {...baseProps({ onCancel })} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("Escape closes the modal while showing a failed state", () => {
    const onCancel = jest.fn();
    render(<PurchaseModal {...baseProps({
      error: "You already own this book.", errorReason: "already_owned", onCancel,
    })} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("Escape does NOT close the modal while deducting", async () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn(async () => new Promise((r) => setTimeout(r, 100)));
    render(<PurchaseModal {...baseProps({ onConfirm, onCancel })} />);
    fireEvent.click(screen.getByTestId("purchase-confirm"));
    await waitFor(() => expect(screen.getByText(/Deducting/i)).toBeInTheDocument());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

/**
 * CRITICAL CORRECTION — theme safety. The previous version used static
 * Tailwind custom colors (parchment/faded/walnut/ink — fixed hex in
 * tailwind.config.js) on a hardcoded dark-plum card, disconnected from
 * the app's real day/night theme system entirely. These tests prove the
 * card and its text are now wired to the SAME --bgfx-* CSS variables
 * every other theme-aware surface in this app uses (index.css:
 * html[data-theme="light"]/html[data-theme="dark"]), and that the few
 * remaining literal accent colors (gold/emerald/red) pick a light-safe
 * or dark-safe variant that reacts LIVE to an automatic theme switch —
 * not just at mount time.
 */
describe("PurchaseModal — theme safety (Light/Dark/automatic switching)", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  // jsdom's CSS parser (cssstyle) silently drops any style value containing
  // var() inside a color function — e.g. `el.style.background =
  // "rgb(var(--bgfx-card))"` round-trips as "" in jsdom, even though this
  // is standard, fully-supported CSS in every real browser (and already
  // proven working in production elsewhere in this app — see
  // AttendanceOverview.jsx's identical pattern from the dark-mode fix).
  // Verified directly against jsdom before writing this test. So this is
  // a structural source-text check (the established convention in this
  // codebase for exactly this gap — see ReaderPage.jsx's own test files'
  // comments about having "no existing mountable test harness") rather
  // than a runtime DOM assertion jsdom cannot represent either way.
  test("the component's own source uses the app's real --bgfx-* theme variables for card/ink/border color, never the old static parchment/faded/walnut literals", () => {
    // eslint-disable-next-line global-require
    const fs = require("fs");
    // eslint-disable-next-line global-require
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "PurchaseModal.jsx"), "utf8");
    expect(src).toMatch(/--bgfx-card/);
    expect(src).toMatch(/--bgfx-ink/);
    expect(src).toMatch(/--bgfx-line/);
    // The old, permanently-dark, theme-blind palette must be gone entirely.
    expect(src).not.toMatch(/text-parchment/);
    expect(src).not.toMatch(/text-faded/);
    expect(src).not.toMatch(/#2A1F38/);
    expect(src).not.toMatch(/#150F1D/);
  });

  test("in light mode, accent text uses the light-safe (dark, high-contrast) gold — never the pale gold meant for a dark card", () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<PurchaseModal {...baseProps()} />);
    const priceLabel = screen.getByText("Price").nextSibling ?? screen.getByTestId("purchase-price").parentElement;
    // The "Spend N pts to unlock" copy's accent span carries the gold color.
    const spendCopy = document.querySelector('[style*="color: rgb(138, 90, 18)"]');
    expect(spendCopy).not.toBeNull();
    // The pale, dark-card-only gold must NOT appear anywhere in light mode.
    expect(document.querySelector('[style*="color: rgb(255, 225, 154)"]')).toBeNull();
  });

  test("in dark mode, accent text uses the dark-safe (pale, high-contrast-on-dark) gold", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<PurchaseModal {...baseProps()} />);
    expect(document.querySelector('[style*="color: rgb(255, 225, 154)"]')).not.toBeNull();
    expect(document.querySelector('[style*="color: rgb(138, 90, 18)"]')).toBeNull();
  });

  test("switching the app's theme WHILE the modal is open live-updates the accent colors (automatic day/night switch)", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<PurchaseModal {...baseProps()} />);
    expect(document.querySelector('[style*="color: rgb(255, 225, 154)"]')).not.toBeNull();

    await act(async () => {
      document.documentElement.setAttribute("data-theme", "light");
      // Let the MutationObserver's microtask/callback flush.
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(document.querySelector('[style*="color: rgb(138, 90, 18)"]')).not.toBeNull();
    });
    expect(document.querySelector('[style*="color: rgb(255, 225, 154)"]')).toBeNull();
  });

  test("a failed-state panel (e.g. Already Owned) renders correctly in light mode with no crash and the expected copy", () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<PurchaseModal {...baseProps({
      error: "You already own this book.", errorReason: "already_owned",
    })} />);
    expect(screen.getByText("You already own this book")).toBeInTheDocument();
    // Same jsdom var()-in-color-function limitation as above — the ink
    // color wiring itself is covered by the source-text structural test.
  });

  test("the balance and price figures use semantic emerald/red accents that are ALSO theme-safe pairs, not the dark-only defaults", () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<PurchaseModal {...baseProps({ balance: 5 })} />); // insufficient — red path
    expect(document.querySelector('[style*="color: rgb(179, 38, 30)"]')).not.toBeNull();
    expect(document.querySelector('[style*="color: rgb(255, 174, 174)"]')).toBeNull(); // dark-only red literal
  });
});
