/**
 * purchaseService.test.js
 * ========================
 * P0 coupon redemption bug: a 100%-off (or any full-discount) coupon made
 * purchaseBook() reject a fresh, never-before-purchased book as
 * "ALREADY_OWNED" on the very first attempt. Root cause: the caller
 * (LibraryPage.confirmPurchase) built a price-zeroed clone of `book` to
 * pass the coupon-discounted amount through, and purchaseBook()'s own
 * isUnlocked(studentId, book) ownership check used that SAME zeroed clone
 * — isUnlocked() treats price<=0 as "this is a free catalog book, always
 * unlocked," so any coupon reducing the price to exactly 0 was
 * indistinguishable from a genuinely free book that's automatically owned.
 *
 * Fix: purchaseBook() now takes an explicit `chargeAmount` used ONLY for
 * the balance/deduction math; the ownership check always uses the book's
 * real, untouched price. These tests lock that contract in and cover the
 * surrounding purchase-flow scenarios from the P0 audit.
 */
import { purchaseBook, isUnlocked } from "../purchaseService.js";

jest.mock("../../../portal/lib/api", () => ({
  api: {
    pointsLogin: jest.fn(),
    sendPoints: jest.fn(),
    libraryUnlock: jest.fn(),
  },
}));
jest.mock("../unlocksService.js", () => ({
  recordUnlock: jest.fn(async () => ({ appsScript: { attempted: true }, form: { attempted: false } })),
}));

import { api as portalApi } from "../../../portal/lib/api";
import { recordUnlock } from "../unlocksService.js";

const BOOK = { slug: "the-unexpected-opportunity", price: 25 };

function ledgerKey(studentId) {
  return "eduhub_lib_unlocks_" + studentId;
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  portalApi.pointsLogin.mockResolvedValue({ success: true, points: 100 });
  portalApi.sendPoints.mockResolvedValue({ success: true });
});

describe("purchaseBook — coupon-discounted price never fools the ownership check", () => {
  test("fresh user + 100%-off coupon succeeds on the first attempt (the reported bug)", async () => {
    const res = await purchaseBook({
      studentId: "stu094",
      password: "pw",
      book: BOOK, // real catalog price (25), untouched
      chargeAmount: 0, // 100%-off coupon
      portalPoints: 56,
    });
    expect(res.success).toBe(true);
    expect(res.reason).toBeUndefined();
    expect(res.price).toBe(0);
    // No treasury transfer needed for a fully-covered purchase.
    expect(portalApi.sendPoints).not.toHaveBeenCalled();
  });

  test("fresh user + partial coupon deducts the DISCOUNTED amount, not the catalog price", async () => {
    const res = await purchaseBook({
      studentId: "stu001",
      password: "pw",
      book: BOOK, // price 25
      chargeAmount: 20, // e.g. 20% off
      portalPoints: 100,
    });
    expect(res.success).toBe(true);
    expect(portalApi.sendPoints).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 20 })
    );
  });

  test("a student who genuinely already owns the book is still correctly blocked, coupon or not", async () => {
    localStorage.setItem(
      ledgerKey("stu777"),
      JSON.stringify([{ slug: BOOK.slug, mode: "server" }])
    );
    const res = await purchaseBook({
      studentId: "stu777",
      password: "pw",
      book: BOOK,
      chargeAmount: 0,
      portalPoints: 100,
    });
    expect(res.success).toBe(false);
    expect(res.reason).toBe("ALREADY_OWNED");
    expect(portalApi.sendPoints).not.toHaveBeenCalled();
  });

  test("normal purchase with no coupon is unaffected — deducts the full catalog price", async () => {
    const res = await purchaseBook({
      studentId: "stu002",
      password: "pw",
      book: BOOK,
      portalPoints: 100,
    });
    expect(res.success).toBe(true);
    expect(portalApi.sendPoints).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 25 })
    );
  });

  test("insufficient funds is judged against the DISCOUNTED amount, not the original price", async () => {
    portalApi.pointsLogin.mockResolvedValue({ success: true, points: 10 });
    const res = await purchaseBook({
      studentId: "stu003",
      password: "pw",
      book: BOOK, // 25 pts catalog price — would fail with only 10 pts
      chargeAmount: 5, // coupon brings it down to 5 — affordable
      portalPoints: 10,
    });
    expect(res.success).toBe(true);
  });

  test("insufficient funds still correctly blocks when even the discounted amount can't be covered", async () => {
    portalApi.pointsLogin.mockResolvedValue({ success: true, points: 3 });
    const res = await purchaseBook({
      studentId: "stu004",
      password: "pw",
      book: BOOK,
      chargeAmount: 5,
      portalPoints: 3,
    });
    expect(res.success).toBe(false);
    expect(res.reason).toBe("INSUFFICIENT");
  });

  test("a genuinely free catalog book (price<=0) is already considered owned by isUnlocked() itself — purchaseBook() correctly refuses to 're-grant' it rather than treating that as a failure state", async () => {
    // Not reachable via the real UI (LibraryPage only calls purchaseBook()
    // when needsPurchase required book.price > 0), but documents the
    // actual, intentional isUnlocked() semantics this fix depends on: a
    // free book's own real price (never a coupon amount) is what makes
    // isUnlocked() return true, and that is correct — it's a real ownership
    // signal, not the bug. The bug was ONLY a coupon-discounted PAID book's
    // price being fed into that same check.
    const freeBook = { slug: "a-free-story", price: 0 };
    expect(isUnlocked("stu005", freeBook)).toBe(true);
    const res = await purchaseBook({
      studentId: "stu005",
      password: "pw",
      book: freeBook,
      portalPoints: 0,
    });
    expect(res.reason).toBe("ALREADY_OWNED");
  });

  test("a 100%-off coupon purchase records mode:'server' (not 'free') so isUnlocked() recognizes it via the local-ledger fallback", async () => {
    await purchaseBook({
      studentId: "stu006",
      password: "pw",
      book: BOOK,
      chargeAmount: 0,
      portalPoints: 56,
    });
    const ledger = JSON.parse(localStorage.getItem(ledgerKey("stu006")));
    expect(ledger[0].mode).toBe("server");
    expect(ledger[0].coupon).toBe(true);
    // The very next isUnlocked() check (e.g. reopening the book) must now
    // recognize real ownership WITHOUT needing the coupon-zeroed price.
    expect(isUnlocked("stu006", BOOK)).toBe(true);
  });

  test("a 100%-off coupon purchase writes to the SAME cross-device channels as a real points purchase (ownership parity fix)", async () => {
    // Same-device recognition (mode:"server") was already covered above,
    // but that alone isn't enough — a coupon-redeemed book must ALSO be
    // recorded the same durable way a points purchase is, so it's visible
    // to the same student on a different device/browser. The earlier bug
    // skipped this cross-device write entirely for a zero-cost unlock.
    const res = await purchaseBook({
      studentId: "stu008",
      password: "pw",
      book: BOOK,
      chargeAmount: 0,
      portalPoints: 56,
    });
    expect(res.success).toBe(true);
    expect(recordUnlock).toHaveBeenCalledWith("stu008", BOOK.slug, 0, "pw");
    expect(portalApi.libraryUnlock).toHaveBeenCalledWith("stu008", BOOK.slug, "pw");
  });

  test("a coupon purchase and a full-price purchase reach the exact same recording steps 3-5 — only the treasury transfer (step 1) differs", async () => {
    await purchaseBook({
      studentId: "stu009", password: "pw", book: BOOK, portalPoints: 100,
    }); // full price, no coupon
    const fullPriceCalls = { record: recordUnlock.mock.calls.length, portal: portalApi.libraryUnlock.mock.calls.length };
    jest.clearAllMocks();
    portalApi.pointsLogin.mockResolvedValue({ success: true, points: 100 });
    portalApi.sendPoints.mockResolvedValue({ success: true });

    await purchaseBook({
      studentId: "stu010", password: "pw", book: BOOK, chargeAmount: 0, portalPoints: 56,
    }); // fully covered by coupon
    expect(recordUnlock.mock.calls.length).toBe(fullPriceCalls.record);
    expect(portalApi.libraryUnlock.mock.calls.length).toBe(fullPriceCalls.portal);
    expect(portalApi.sendPoints).not.toHaveBeenCalled(); // the ONLY real difference
  });

  test("re-attempting the same purchase after a successful coupon redemption correctly reports ALREADY_OWNED (a true duplicate, not a false first-attempt failure)", async () => {
    const first = await purchaseBook({
      studentId: "stu007",
      password: "pw",
      book: BOOK,
      chargeAmount: 0,
      portalPoints: 56,
    });
    expect(first.success).toBe(true);

    const retry = await purchaseBook({
      studentId: "stu007",
      password: "pw",
      book: BOOK,
      chargeAmount: 0,
      portalPoints: 56,
    });
    expect(retry.success).toBe(false);
    expect(retry.reason).toBe("ALREADY_OWNED");
  });
});
