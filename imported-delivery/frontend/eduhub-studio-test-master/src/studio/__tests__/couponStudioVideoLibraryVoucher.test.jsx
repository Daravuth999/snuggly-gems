/**
 * couponStudioVideoLibraryVoucher.test.jsx — Author Studio coverage for the
 * "Video Library Voucher" coupon purpose, closing the gap where
 * video_library_coupon_tools.py's student-side redemption existed with no
 * way for an Author to actually create a code through the product. Mirrors
 * couponStudioLiveVoiceCoachCoupon.test.jsx's structure exactly (same
 * mocks, same conventions) so this stays a genuinely additive third
 * purpose, not a redesign of the existing two.
 */
import fs from "fs";
import path from "path";
import React from "react";
import { render, fireEvent, waitFor, act, screen } from "@testing-library/react";

jest.mock("../api", () => ({
  listCoupons: jest.fn(), createCoupon: jest.fn(), updateCoupon: jest.fn(), deleteCoupon: jest.fn(),
}));
jest.mock("../components/StudioPickers", () => ({
  useStudentList: () => ({ students: [], loading: false, error: null }),
  useBookList: () => ({ books: [], loading: false, error: null }),
  MultiStudentPicker: ({ testid }) => <div data-testid={testid || "mock-student-picker"} />,
  BookPicker: ({ testid }) => <div data-testid={testid || "mock-book-picker"} />,
}));

const api = require("../api");
const CouponStudio = require("../CouponStudio").default;

beforeEach(() => {
  jest.clearAllMocks();
  api.listCoupons.mockResolvedValue({ coupons: [] });
});

async function openCreateForm() {
  await act(async () => { render(<CouponStudio />); });
  await waitFor(() => expect(screen.queryByText(/Loading coupons/i)).toBeNull());
  await act(async () => { fireEvent.click(screen.getByText(/New Coupon/i)); });
}

// ── 1. purpose selector includes a third, immediately understandable option
describe("Coupon Purpose selector", () => {
  test("all three purposes are present: Book Discount, Live Voice Coach Coupon, Video Library Voucher", async () => {
    await openCreateForm();
    expect(screen.getByTestId("coupon-purpose-book_discount")).toBeInTheDocument();
    expect(screen.getByTestId("coupon-purpose-edutalk_live_coupon")).toBeInTheDocument();
    expect(screen.getByTestId("coupon-purpose-video_library_points")).toBeInTheDocument();
    expect(screen.getByTestId("coupon-purpose-video_library_points").textContent).toMatch(/Video Library Voucher/i);
  });
});

// ── 2/3. purpose switch shows/hides the right fields ────────────────────────
describe("Video Library Voucher — form fields", () => {
  test("switching to Video Library Voucher shows the points-amount field and preview", async () => {
    await openCreateForm();
    fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
    expect(screen.getByTestId("coupon-video-library-amount")).toBeInTheDocument();
    expect(screen.getByTestId("coupon-video-library-preview")).toBeInTheDocument();
  });

  test("switching to Video Library Voucher hides book-discount-only AND Live Voice Coach fields", async () => {
    await openCreateForm();
    fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
    expect(screen.queryByTestId("coupon-book-discount-type")).toBeNull();
    expect(screen.queryByTestId("coupon-book-discount-value")).toBeNull();
    expect(screen.queryByTestId("coupon-book-slugs-picker")).toBeNull();
    expect(screen.queryByTestId("coupon-edutalk-amount")).toBeNull();
  });

  test("preview card clearly communicates the benefit to a teacher/admin, in plain language", async () => {
    await openCreateForm();
    fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
    fireEvent.change(screen.getByTestId("coupon-video-library-amount"), { target: { value: "20" } });
    const preview = screen.getByTestId("coupon-video-library-preview").textContent;
    // 2026-09: copy updated to correctly say "restricted" — these points
    // are no longer unrestricted general currency (§2 of the coupons
    // round), so the old "20 EduHub Points" wording would now be false.
    expect(preview).toMatch(/20 points/i);
    expect(preview).toMatch(/restricted/i);
    expect(preview).toMatch(/Video Library/i);
    expect(preview).toMatch(/redeem/i);
  });
});

// ── 4. submit payload shape ──────────────────────────────────────────────────
describe("Video Library Voucher — submit payload", () => {
  test("submit payload contains benefit_type=video_library_points and a positive integer benefit_amount", async () => {
    api.createCoupon.mockResolvedValue({ coupon: { code: "VL20" } });
    await openCreateForm();
    fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
    fireEvent.change(screen.getByTestId("coupon-video-library-amount"), { target: { value: "20" } });
    await act(async () => { fireEvent.click(screen.getByText(/^Create Coupon$/i)); });
    await waitFor(() => expect(api.createCoupon).toHaveBeenCalled());
    const payload = api.createCoupon.mock.calls[0][0];
    expect(payload.benefit_type).toBe("video_library_points");
    expect(payload.benefit_amount).toBe(20);
    expect(Number.isInteger(payload.benefit_amount)).toBe(true);
    expect(payload.book_slugs).toEqual([]);
    // No dummy discount fields — matches the Live Voice Coach payload shape.
    expect(payload).not.toHaveProperty("type");
    expect(payload).not.toHaveProperty("value");
  });

  test.each(["-5", "0", "1.5", "abc", "1001"])(
    "invalid amount '%s' is blocked before any network call",
    async (bad) => {
      await openCreateForm();
      fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
      fireEvent.change(screen.getByTestId("coupon-video-library-amount"), { target: { value: bad } });
      await act(async () => { fireEvent.click(screen.getByText(/^Create Coupon$/i)); });
      expect(api.createCoupon).not.toHaveBeenCalled();
      expect(screen.getByText(/whole number between 1 and/i)).toBeInTheDocument();
    },
  );

  test("code, max uses, dates, and assigned-to are still passed through like any other purpose", async () => {
    api.createCoupon.mockResolvedValue({ coupon: { code: "VLLAUNCH" } });
    await openCreateForm();
    fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
    fireEvent.change(screen.getByPlaceholderText(/SUMMER20/i), { target: { value: "vllaunch" } });
    fireEvent.change(screen.getByTestId("coupon-video-library-amount"), { target: { value: "15" } });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 50/i), { target: { value: "100" } });
    await act(async () => { fireEvent.click(screen.getByText(/^Create Coupon$/i)); });
    await waitFor(() => expect(api.createCoupon).toHaveBeenCalled());
    const payload = api.createCoupon.mock.calls[0][0];
    expect(payload.code).toBe("VLLAUNCH");
    expect(payload.max_uses).toBe(100);
  });
});

// ── §1 (2026-09): percent offer type ────────────────────────────────────────
describe("Video Library Voucher — percent offer type", () => {
  test("Offer Type selector defaults to points, hiding the percent value field", async () => {
    await openCreateForm();
    fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
    expect(screen.getByTestId("coupon-video-library-offer-type")).toHaveValue("points");
    expect(screen.getByTestId("coupon-video-library-amount")).toBeInTheDocument();
    expect(screen.queryByTestId("coupon-video-library-percent-value")).toBeNull();
  });

  test("switching Offer Type to percent swaps the points-amount field for a percent-value field", async () => {
    await openCreateForm();
    fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
    fireEvent.change(screen.getByTestId("coupon-video-library-offer-type"), { target: { value: "percent" } });
    expect(screen.queryByTestId("coupon-video-library-amount")).toBeNull();
    expect(screen.getByTestId("coupon-video-library-percent-value")).toBeInTheDocument();
  });

  test("percent submit payload contains type=percent and value, never benefit_amount", async () => {
    api.createCoupon.mockResolvedValue({ coupon: { code: "VLPCT20" } });
    await openCreateForm();
    fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
    fireEvent.change(screen.getByTestId("coupon-video-library-offer-type"), { target: { value: "percent" } });
    fireEvent.change(screen.getByTestId("coupon-video-library-percent-value"), { target: { value: "25" } });
    await act(async () => { fireEvent.click(screen.getByText(/^Create Coupon$/i)); });
    await waitFor(() => expect(api.createCoupon).toHaveBeenCalled());
    const payload = api.createCoupon.mock.calls[0][0];
    expect(payload.benefit_type).toBe("video_library_points");
    expect(payload.type).toBe("percent");
    expect(payload.value).toBe(25);
    expect(payload).not.toHaveProperty("benefit_amount");
  });

  test.each(["0", "-5", "101", "abc"])(
    "invalid percent value '%s' is blocked before any network call",
    async (bad) => {
      await openCreateForm();
      fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
      fireEvent.change(screen.getByTestId("coupon-video-library-offer-type"), { target: { value: "percent" } });
      fireEvent.change(screen.getByTestId("coupon-video-library-percent-value"), { target: { value: bad } });
      await act(async () => { fireEvent.click(screen.getByText(/^Create Coupon$/i)); });
      expect(api.createCoupon).not.toHaveBeenCalled();
      expect(screen.getByText(/percent discount must be a number between 1 and 100/i)).toBeInTheDocument();
    },
  );

  test("100% is a valid boundary value", async () => {
    api.createCoupon.mockResolvedValue({ coupon: { code: "VLFREE" } });
    await openCreateForm();
    fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
    fireEvent.change(screen.getByTestId("coupon-video-library-offer-type"), { target: { value: "percent" } });
    fireEvent.change(screen.getByTestId("coupon-video-library-percent-value"), { target: { value: "100" } });
    await act(async () => { fireEvent.click(screen.getByText(/^Create Coupon$/i)); });
    await waitFor(() => expect(api.createCoupon).toHaveBeenCalled());
    expect(api.createCoupon.mock.calls[0][0].value).toBe(100);
  });

  test("percent preview text never mentions a points balance", async () => {
    await openCreateForm();
    fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
    fireEvent.change(screen.getByTestId("coupon-video-library-offer-type"), { target: { value: "percent" } });
    fireEvent.change(screen.getByTestId("coupon-video-library-percent-value"), { target: { value: "30" } });
    const preview = screen.getByTestId("coupon-video-library-preview").textContent;
    expect(preview).toMatch(/30%/);
    expect(preview).toMatch(/discount/i);
    expect(preview).not.toMatch(/restricted/i);
    // Correctly says it grants NO balance — that's a negation, not a claim
    // of crediting one, so "no points balance" is the accurate wording.
    expect(preview).toMatch(/no points balance/i);
  });
});

// ── Coupon list rendering — percent-type Video Library Voucher ─────────────
describe("Coupon list rendering — Video Library percent voucher", () => {
  test("a percent-type Video Library Voucher shows % off, not a points amount, in its badge", async () => {
    api.listCoupons.mockResolvedValue({
      coupons: [{
        code: "VLPCT25", type: "percent", value: 25, benefit_amount: null,
        max_uses: null, uses_count: 0, assigned_to: [], book_slugs: [],
        valid_from: null, expires_at: null, enabled: true, redemptions: [],
        benefit_type: "video_library_points", created_at: "2026-01-01T00:00:00Z",
      }],
    });
    await act(async () => { render(<CouponStudio />); });
    await waitFor(() => expect(screen.queryByText(/Loading coupons/i)).toBeNull());
    const badge = screen.getByTestId("coupon-purpose-badge-VLPCT25");
    expect(badge.textContent).toMatch(/25% off/);
    expect(badge.textContent).not.toMatch(/pts/);
  });

  test("redemption history for a percent voucher shows Lesson/Original/Paid columns, not Status/Points/Credited", async () => {
    api.listCoupons.mockResolvedValue({
      coupons: [{
        code: "VLPCT25", type: "percent", value: 25, benefit_amount: null,
        max_uses: null, uses_count: 1, assigned_to: [], book_slugs: [],
        valid_from: null, expires_at: null, enabled: true,
        redemptions: [{
          student_id: "stu1", benefit_type: "video_library_points", code: "VLPCT25",
          lesson_id: "vid_42", original_price: 100, discounted_price: 75,
          redeemed_at: "2026-02-01T00:00:00Z",
        }],
        benefit_type: "video_library_points", created_at: "2026-01-01T00:00:00Z",
      }],
    });
    await act(async () => { render(<CouponStudio />); });
    await waitFor(() => expect(screen.queryByText(/Loading coupons/i)).toBeNull());
    await act(async () => { fireEvent.click(screen.getByTestId("coupon-expand-VLPCT25")); });
    const table = screen.getByTestId("coupon-redemptions-VLPCT25");
    expect(table.textContent).toMatch(/Lesson/);
    expect(table.textContent).toMatch(/vid_42/);
    expect(table.textContent).toMatch(/100/);
    expect(table.textContent).toMatch(/75/);
    expect(table.textContent).not.toMatch(/Credited/);
  });
});

// ── 5. list rendering: badge, benefit label, redemption table ──────────────
describe("Coupon list rendering", () => {
  test("a Video Library Voucher is clearly labeled and distinct from a Live Voice Coach Coupon", async () => {
    api.listCoupons.mockResolvedValue({
      coupons: [{ code: "VLIB1", type: null, value: null, max_uses: 1, uses_count: 0,
                  assigned_to: ["stu1"], book_slugs: [], enabled: true, redemptions: [],
                  benefit_type: "video_library_points", benefit_amount: 20 }],
    });
    await act(async () => { render(<CouponStudio />); });
    await waitFor(() => expect(screen.getByText("VLIB1")).toBeInTheDocument());
    const badge = screen.getByTestId("coupon-purpose-badge-VLIB1").textContent;
    expect(badge).toMatch(/Video Library Voucher/i);
    expect(badge).toMatch(/20 pts/i);
    expect(badge).not.toMatch(/Live Voice Coach/i);
  });

  test("redemption history table renders points-style columns (Status/Points/Credited) for a Video Library Voucher, same as a Live Voice Coach Coupon", async () => {
    api.listCoupons.mockResolvedValue({
      coupons: [{ code: "VLIB2", type: null, value: null, max_uses: 1, uses_count: 1,
                  assigned_to: ["stu1"], book_slugs: [], enabled: true,
                  benefit_type: "video_library_points", benefit_amount: 20,
                  redemptions: [{ student_id: "stu1", status: "credited", benefit_amount: 20, credited_at: "2026-01-01T00:00:00Z" }] }],
    });
    await act(async () => { render(<CouponStudio />); });
    await waitFor(() => expect(screen.getByText("VLIB2")).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByTestId("coupon-expand-VLIB2")); });
    expect(screen.getByTestId("coupon-redemptions-VLIB2")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Credited")).toBeInTheDocument();
    expect(screen.queryByText("Original")).toBeNull(); // book-discount-only column
  });

  test("old coupons lacking benefit_type entirely still render as Book Discount, unaffected by the new purpose", async () => {
    api.listCoupons.mockResolvedValue({
      coupons: [{ code: "LEGACY2", type: "percent", value: 15, max_uses: null, uses_count: 0,
                  assigned_to: [], book_slugs: [], enabled: true, redemptions: [] }],
    });
    await act(async () => { render(<CouponStudio />); });
    await waitFor(() => expect(screen.getByText("LEGACY2")).toBeInTheDocument());
    expect(screen.getByText(/15% off/i)).toBeInTheDocument();
    expect(screen.queryByTestId(`coupon-purpose-badge-LEGACY2`)).toBeNull();
  });
});
