/**
 * PurchaseLessonModal.test.jsx — the premium video purchase experience.
 * The backend purchase state machine stays authoritative: these tests
 * prove the modal only unlocks on a confirmed `ok: true` response, shows
 * canonical formatPoints balances (never float noise), and renders honest
 * failure / insufficient-points states.
 */
const mockSetBalance = jest.fn();
const mockRefreshPoints = jest.fn().mockResolvedValue(104.16);
let mockStudent = { studentId: "stu001", password: "secret", points: 154.15999999999988 };
jest.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ student: mockStudent, setBalance: mockSetBalance, refreshPoints: mockRefreshPoints }),
}));

jest.mock("../videoLibraryApi", () => ({ purchaseLesson: jest.fn() }));

// The real PointsPurchaseModal does live package fetches, QR polling and
// Lottie — irrelevant to this file's concern (that Get Points opens it
// IN CONTEXT instead of navigating away). A minimal stand-in exposes just
// enough surface (its studentId prop + a "credit now" button) to prove
// the wiring, matching how PointsGateModal's own tests mock this same
// dependency.
const mockOnCreditedRef = { current: null };
jest.mock("../../portal/components/dashboard/PointsPurchaseModal", () => ({
  __esModule: true,
  default: ({ studentId, onClose, onCredited }) => {
    mockOnCreditedRef.current = onCredited;
    return (
      <div data-testid="mock-points-purchase-modal" data-student-id={studentId}>
        <button data-testid="mock-points-purchase-close" onClick={onClose}>Close</button>
        <button data-testid="mock-points-purchase-credit" onClick={() => onCredited(999)}>Credit</button>
      </div>
    );
  },
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PurchaseLessonModal from "../PurchaseLessonModal";
import { purchaseLesson } from "../videoLibraryApi";

const LESSON = { lessonId: "vid_1", title: "A Small Act of Kindness", price: 50, thumbnailUrl: "https://cdn/thumb.jpg" };

beforeEach(() => {
  jest.clearAllMocks();
  mockStudent = { studentId: "stu001", password: "secret", points: 154.15999999999988 };
});

function renderModal(props = {}) {
  return render(
    <PurchaseLessonModal lesson={LESSON} open onClose={jest.fn()} onUnlocked={jest.fn()} {...props} />,
  );
}

test("renders nothing when closed", () => {
  render(<PurchaseLessonModal lesson={LESSON} open={false} onClose={jest.fn()} />);
  expect(screen.queryByTestId("video-purchase-modal")).not.toBeInTheDocument();
});

test("confirm screen shows artwork, title, price and formatted real balances — never float noise", () => {
  renderModal();
  expect(screen.getByTestId("video-purchase-lesson-title")).toHaveTextContent("A Small Act of Kindness");
  expect(screen.getByTestId("video-purchase-price")).toHaveTextContent("50 EduHub Points");
  expect(screen.getByTestId("video-purchase-balance-before")).toHaveTextContent("154.16 pts");
  expect(screen.getByTestId("video-purchase-balance-after")).toHaveTextContent("104.16 pts");
  expect(document.body.textContent).not.toContain("154.15999999999988");
});

test("successful purchase: backend-confirmed state drives success UI, new balance uses authoritative pointsAfter", async () => {
  purchaseLesson.mockResolvedValue({ ok: true, purchase: { state: "succeeded", pointsAfter: 104.16 } });
  const onUnlocked = jest.fn();
  renderModal({ onUnlocked });
  fireEvent.click(screen.getByTestId("video-purchase-confirm-button"));
  expect(await screen.findByTestId("video-purchase-success")).toBeInTheDocument();
  expect(purchaseLesson).toHaveBeenCalledWith("vid_1", { password: "secret" });
  expect(screen.getByTestId("video-purchase-debit")).toHaveTextContent("−50 pts");
  expect(screen.getByTestId("video-purchase-new-balance")).toHaveTextContent("104.16 pts");
  expect(mockSetBalance).toHaveBeenCalledWith(104.16);
  expect(mockRefreshPoints).toHaveBeenCalled();
  // Unlock only continues on the explicit Start Learning action.
  expect(onUnlocked).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("video-purchase-start-learning-button"));
  expect(onUnlocked).toHaveBeenCalled();
});

test("rejected purchase: honest failure with retry, lesson never unlocks", async () => {
  purchaseLesson.mockResolvedValue({ ok: false, purchase: { state: "failed_rejected" } });
  const onUnlocked = jest.fn();
  renderModal({ onUnlocked });
  fireEvent.click(screen.getByTestId("video-purchase-confirm-button"));
  expect(await screen.findByTestId("video-purchase-error")).toBeInTheDocument();
  expect(screen.getByText(/could not be completed/i)).toBeInTheDocument();
  expect(screen.getByTestId("video-purchase-retry-button")).toBeInTheDocument();
  expect(onUnlocked).not.toHaveBeenCalled();
  expect(mockSetBalance).not.toHaveBeenCalled();
});

test("reconcile outcome: pending-review message with NO retry (matches the backend state machine)", async () => {
  purchaseLesson.mockResolvedValue({ ok: false, purchase: { state: "reconcile" } });
  renderModal();
  fireEvent.click(screen.getByTestId("video-purchase-confirm-button"));
  expect(await screen.findByTestId("video-purchase-error")).toBeInTheDocument();
  expect(screen.getByText(/pending review\. The lesson stays locked/i)).toBeInTheDocument();
  expect(screen.queryByTestId("video-purchase-retry-button")).not.toBeInTheDocument();
});

test("network error surfaces a friendly retryable message, never a raw stack", async () => {
  purchaseLesson.mockRejectedValue(new Error("HTTP 500"));
  renderModal();
  fireEvent.click(screen.getByTestId("video-purchase-confirm-button"));
  expect(await screen.findByTestId("video-purchase-error")).toBeInTheDocument();
  expect(screen.getByTestId("video-purchase-retry-button")).toBeInTheDocument();
});

test("insufficient points: dedicated state with both balances, purchase never attempted", () => {
  mockStudent = { ...mockStudent, points: 32 };
  renderModal();
  expect(screen.getByTestId("video-purchase-insufficient")).toBeInTheDocument();
  expect(screen.getByText(/50 pts/)).toBeInTheDocument();
  expect(screen.getByTestId("video-purchase-insufficient-balance")).toHaveTextContent("32 pts");
  expect(screen.queryByTestId("video-purchase-confirm-button")).not.toBeInTheDocument();
  expect(purchaseLesson).not.toHaveBeenCalled();
});

test("Get Points opens the top-up modal IN CONTEXT — never navigates away from the Video Library", () => {
  mockStudent = { ...mockStudent, points: 32 };
  renderModal();
  expect(screen.queryByTestId("mock-points-purchase-modal")).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId("video-purchase-get-points-button"));
  // The player/purchase sheet is still mounted — only the top-up modal was
  // added on top of it, matching PointsGateModal's own "never leaves" rule.
  expect(screen.getByTestId("video-purchase-insufficient")).toBeInTheDocument();
  expect(screen.getByTestId("mock-points-purchase-modal")).toBeInTheDocument();
  expect(screen.getByTestId("mock-points-purchase-modal")).toHaveAttribute("data-student-id", "stu001");
});

test("crediting points via the top-up modal refreshes the balance and closes the top-up modal", () => {
  mockStudent = { ...mockStudent, points: 32 };
  renderModal();
  fireEvent.click(screen.getByTestId("video-purchase-get-points-button"));
  fireEvent.click(screen.getByTestId("mock-points-purchase-credit"));
  expect(mockRefreshPoints).toHaveBeenCalled();
  expect(screen.queryByTestId("mock-points-purchase-modal")).not.toBeInTheDocument();
});

test("closing the top-up modal returns to the insufficient-points sheet, not the Dashboard", () => {
  mockStudent = { ...mockStudent, points: 32 };
  renderModal();
  fireEvent.click(screen.getByTestId("video-purchase-get-points-button"));
  fireEvent.click(screen.getByTestId("mock-points-purchase-close"));
  expect(screen.queryByTestId("mock-points-purchase-modal")).not.toBeInTheDocument();
  expect(screen.getByTestId("video-purchase-insufficient")).toBeInTheDocument();
});

test("a genuine backend insufficient-funds rejection (not just the pre-flight check) shows the SAME dedicated insufficient-points UI, backed by a fresh balance read — not a vague generic error", async () => {
  // The pre-flight snapshot (154.16) says sufficient, so the confirm button
  // is reachable and the API call fires. GAS itself rejects it (a real
  // balance mismatch the stale client snapshot didn't know about yet).
  // refreshPoints() in real AuthContext updates `student` as a side effect
  // (which is what makes `insufficient` re-evaluate correctly on the next
  // render) — mirrored here rather than just resolving a bare number.
  purchaseLesson.mockResolvedValue({ ok: false, purchase: { state: "failed" } });
  mockRefreshPoints.mockImplementationOnce(async () => { mockStudent = { ...mockStudent, points: 32 }; return 32; });
  renderModal();
  expect(screen.getByTestId("video-purchase-confirm-button")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("video-purchase-confirm-button"));
  expect(await screen.findByTestId("video-purchase-insufficient")).toBeInTheDocument();
  expect(screen.queryByTestId("video-purchase-error")).not.toBeInTheDocument();
});

test("a genuine backend rejection where the fresh balance IS sufficient still shows the generic honest failure — never misattributed to insufficient funds", async () => {
  purchaseLesson.mockResolvedValue({ ok: false, purchase: { state: "failed" } });
  mockRefreshPoints.mockImplementationOnce(async () => { mockStudent = { ...mockStudent, points: 200 }; return 200; });
  renderModal();
  fireEvent.click(screen.getByTestId("video-purchase-confirm-button"));
  expect(await screen.findByTestId("video-purchase-error")).toBeInTheDocument();
  expect(screen.getByText(/could not be completed/i)).toBeInTheDocument();
});

test("balance rows are hidden gracefully when no wallet value is known", () => {
  mockStudent = { studentId: "stu001", password: "secret" };
  renderModal();
  expect(screen.getByTestId("video-purchase-confirm-button")).toBeInTheDocument();
  expect(screen.queryByTestId("video-purchase-balance-before")).not.toBeInTheDocument();
});

/* ── v2 UX redesign: one coherent surface, not two stacked dialogs ──────── */

test("confirm screen shows the elegant points ledger (balance / cost / remaining) and the price on the primary CTA", () => {
  renderModal();
  expect(screen.getByTestId("video-purchase-debit-preview")).toHaveTextContent("−50 pts");
  expect(screen.getByTestId("video-purchase-balance-before")).toHaveTextContent("154.16 pts");
  expect(screen.getByTestId("video-purchase-balance-after")).toHaveTextContent("104.16 pts");
  expect(screen.getByTestId("video-purchase-confirm-button")).toHaveTextContent("Unlock Lesson — 50 pts");
  expect(screen.getByTestId("video-purchase-cancel-button")).toHaveTextContent("Not now");
});

test("lesson identity (thumbnail context) stays visible through processing and success — no context loss between phases", async () => {
  purchaseLesson.mockResolvedValue({ ok: true, purchase: { state: "succeeded", pointsAfter: 104.16 } });
  renderModal();
  fireEvent.click(screen.getByTestId("video-purchase-confirm-button"));
  expect(screen.getByTestId("video-purchase-processing")).toBeInTheDocument();
  expect(screen.getByTestId("video-purchase-identity-strip")).toHaveTextContent("A Small Act of Kindness");
  expect(await screen.findByTestId("video-purchase-success")).toBeInTheDocument();
  expect(screen.getByTestId("video-purchase-identity-strip")).toHaveTextContent("A Small Act of Kindness");
});

test("no duplicate purchase request fires when the confirm button is invoked twice in quick succession", async () => {
  let resolvePurchase;
  purchaseLesson.mockReturnValue(new Promise((res) => { resolvePurchase = res; }));
  renderModal();
  const btn = screen.getByTestId("video-purchase-confirm-button");
  fireEvent.click(btn);
  fireEvent.click(btn); // second tap lands mid-flight, before the phase swap unmounts the button in some renderers
  expect(purchaseLesson).toHaveBeenCalledTimes(1);
  resolvePurchase({ ok: true, purchase: { state: "succeeded", pointsAfter: 104.16 } });
  expect(await screen.findByTestId("video-purchase-success")).toBeInTheDocument();
});

test("already-owned lesson: honest dedicated state (no retry, no fake success) with a direct path into the lesson", async () => {
  const err = new Error("you already own this lesson");
  err.status = 409;
  purchaseLesson.mockRejectedValue(err);
  const onUnlocked = jest.fn();
  renderModal({ onUnlocked });
  fireEvent.click(screen.getByTestId("video-purchase-confirm-button"));
  expect(await screen.findByTestId("video-purchase-error")).toBeInTheDocument();
  expect(screen.getByText(/already own this lesson/i)).toBeInTheDocument();
  expect(screen.queryByTestId("video-purchase-retry-button")).not.toBeInTheDocument();
  expect(mockSetBalance).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("video-purchase-already-owned-continue-button"));
  expect(onUnlocked).toHaveBeenCalled();
});

test("dismissal: clicking the overlay itself (not the card) closes the sheet", () => {
  const onClose = jest.fn();
  const { unmount } = renderModal({ onClose });
  fireEvent.click(screen.getByTestId("video-purchase-modal")); // overlay itself, not the card
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount();
});

test("dismissal: the close button closes the sheet", () => {
  const onClose = jest.fn();
  const { unmount } = renderModal({ onClose });
  fireEvent.click(screen.getByTestId("video-purchase-close-button"));
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount();
});

test("dismissal: Escape closes the sheet when not mid-purchase", () => {
  const onClose = jest.fn();
  const { unmount } = renderModal({ onClose });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount();
});

test("Escape does not dismiss while a purchase is in flight (processing is not closable)", () => {
  purchaseLesson.mockReturnValue(new Promise(() => {})); // never resolves
  const onClose = jest.fn();
  renderModal({ onClose });
  fireEvent.click(screen.getByTestId("video-purchase-confirm-button"));
  expect(screen.getByTestId("video-purchase-processing")).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();
});

test("the sheet reserves real device safe-area space so the CTA is never flush against the home indicator", () => {
  renderModal();
  const card = screen.getByTestId("video-purchase-confirm-button").closest('[role="dialog"]');
  // jsdom's CSSStyleDeclaration silently drops style values it can't fully
  // parse — max(1.25rem, env(safe-area-inset-left)) does not survive
  // jsdom's cssstyle engine even though real browsers support it fine, so
  // those properties are simply absent from the serialized style here.
  // What jsdom DOES parse correctly (min()/calc() without env()) is
  // asserted via the DOM; the env()-bearing paddingBottom/Left/Right are
  // verified against source instead — same reasoning as this file's
  // reduced-motion test below (jsdom can't evaluate what a real browser
  // would render, so the check moves to source).
  expect(card.style.maxHeight).toBeTruthy();
  expect(card.style.overflowY).toBe("auto");

  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "../PurchaseLessonModal.jsx"), "utf8");
  expect(src).toMatch(/paddingBottom:\s*"max\([^"]*env\(safe-area-inset-bottom\)[^"]*"/);
  expect(src).toMatch(/paddingLeft:\s*"max\([^"]*env\(safe-area-inset-left\)[^"]*"/);
  expect(src).toMatch(/paddingRight:\s*"max\([^"]*env\(safe-area-inset-right\)[^"]*"/);
});

test("the dialog is a properly labeled, keyboard-reachable surface", () => {
  renderModal();
  const card = screen.getByTestId("video-purchase-confirm-button").closest('[role="dialog"]');
  expect(card).toHaveAttribute("aria-modal", "true");
  expect(card).toHaveAttribute("aria-labelledby", "video-purchase-heading");
  expect(document.getElementById("video-purchase-heading")).toHaveTextContent("A Small Act of Kindness");
});

// jsdom does not evaluate @media (prefers-reduced-motion) against computed
// styles, so this is a structural (fs) check — matching this codebase's
// established convention for CSS-only assertions (see the module docstring
// note on markdown-to-jsx components). Confirms the new phase-transition
// and ledger-reveal animations are both registered in the SAME
// reduced-motion block as the pre-existing modal animations, so a
// reduced-motion user gets instant state changes with zero decorative
// motion — never a partially-applied "in-between" frame.
test("reduced-motion: the new phase/ledger animations are disabled in the same media block as the existing ones", () => {
  const fs = require("fs");
  const path = require("path");
  const css = fs.readFileSync(path.join(__dirname, "../videoLibrary.css"), "utf8");
  expect(css).toMatch(/@keyframes vl-phase-in/);
  expect(css).toMatch(/@keyframes vl-ledger-row-in/);
  const reducedBlockMatch = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\}\s*$/);
  expect(reducedBlockMatch).toBeTruthy();
  const reducedBlock = reducedBlockMatch[1];
  expect(reducedBlock).toMatch(/\.vl-phase-in/);
  expect(reducedBlock).toMatch(/\.vl-ledger-row/);
  expect(reducedBlock).toMatch(/\.vl-modal-card/); // pre-existing rule still present, unmodified
});

// ── §1, 2026-09: percent-off discount code at checkout ──────────────────────
describe("discount code at checkout", () => {
  test("the code input is hidden by default behind a toggle link", () => {
    renderModal();
    expect(screen.queryByTestId("video-purchase-coupon-input")).not.toBeInTheDocument();
    expect(screen.getByTestId("video-purchase-coupon-toggle-button")).toHaveTextContent(/discount code/i);
  });

  test("revealing the input and typing a code passes couponCode through to purchaseLesson", async () => {
    purchaseLesson.mockResolvedValue({ ok: true, purchase: { state: "succeeded", pointsAfter: 104.16 } });
    renderModal();
    fireEvent.click(screen.getByTestId("video-purchase-coupon-toggle-button"));
    fireEvent.change(screen.getByTestId("video-purchase-coupon-input"), { target: { value: "save20" } });
    fireEvent.click(screen.getByTestId("video-purchase-confirm-button"));
    await waitFor(() => expect(purchaseLesson).toHaveBeenCalled());
    expect(purchaseLesson).toHaveBeenCalledWith("vid_1", { password: "secret", couponCode: "SAVE20" });
  });

  test("purchasing with no code entered sends couponCode: undefined, never an empty string", async () => {
    purchaseLesson.mockResolvedValue({ ok: true, purchase: { state: "succeeded", pointsAfter: 104.16 } });
    renderModal();
    fireEvent.click(screen.getByTestId("video-purchase-confirm-button"));
    await waitFor(() => expect(purchaseLesson).toHaveBeenCalled());
    expect(purchaseLesson).toHaveBeenCalledWith("vid_1", { password: "secret", couponCode: undefined });
  });

  test("clearing the code hides the input again and drops the value", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("video-purchase-coupon-toggle-button"));
    fireEvent.change(screen.getByTestId("video-purchase-coupon-input"), { target: { value: "SAVE20" } });
    fireEvent.click(screen.getByTestId("video-purchase-coupon-clear-button"));
    expect(screen.queryByTestId("video-purchase-coupon-input")).not.toBeInTheDocument();
    expect(screen.getByTestId("video-purchase-coupon-toggle-button")).toBeInTheDocument();
  });

  test("an invalid-coupon rejection shows a dedicated, retryable error distinct from a generic failure", async () => {
    const err = new Error("This code has expired.");
    err.status = 400;
    purchaseLesson.mockRejectedValue(err);
    renderModal();
    fireEvent.click(screen.getByTestId("video-purchase-coupon-toggle-button"));
    fireEvent.change(screen.getByTestId("video-purchase-coupon-input"), { target: { value: "OLDCODE" } });
    fireEvent.click(screen.getByTestId("video-purchase-confirm-button"));
    await waitFor(() => expect(screen.getByTestId("video-purchase-error")).toBeInTheDocument());
    expect(screen.getByText(/discount code could not be applied/i)).toBeInTheDocument();
    expect(screen.getByText(/this code has expired/i)).toBeInTheDocument();
    expect(screen.getByTestId("video-purchase-retry-button")).toBeInTheDocument();
  });
});
