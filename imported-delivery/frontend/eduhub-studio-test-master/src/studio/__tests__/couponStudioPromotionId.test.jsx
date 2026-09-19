/**
 * couponStudioPromotionId.test.jsx — Author Studio coverage for the
 * "Promotion ID" field added to CouponStudio.jsx's book-discount create
 * form. This groups several rotated coupon CODES under ONE shared,
 * server-enforced "at most one successful redemption per student" limit
 * (see eduhub-backend's coupon_tools.py COLL_PROMO_REDEMPTIONS) — closing
 * the reported abuse where a student redeemed the same public 100%-off
 * code repeatedly, once per book, walking away with several free books.
 */
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

test("Book Discount form shows a Promotion ID field", async () => {
  await openCreateForm();
  expect(screen.getByTestId("coupon-promotion-id")).toBeInTheDocument();
});

test("Promotion ID field is not shown for Live Voice Coach or Video Library purpose", async () => {
  await openCreateForm();
  fireEvent.click(screen.getByTestId("coupon-purpose-edutalk_live_coupon"));
  expect(screen.queryByTestId("coupon-promotion-id")).toBeNull();
  fireEvent.click(screen.getByTestId("coupon-purpose-video_library_points"));
  expect(screen.queryByTestId("coupon-promotion-id")).toBeNull();
});

test("leaving Promotion ID blank sends promotion_id: null (standalone coupon, unchanged default)", async () => {
  api.createCoupon.mockResolvedValue({ coupon: { code: "SAVE20" } });
  await openCreateForm();
  fireEvent.change(screen.getByPlaceholderText(/SUMMER20/i), { target: { value: "save20" } });
  fireEvent.change(screen.getByTestId("coupon-book-discount-value"), { target: { value: "20" } });
  await act(async () => { fireEvent.click(screen.getByText(/^Create Coupon$/i)); });
  await waitFor(() => expect(api.createCoupon).toHaveBeenCalled());
  const payload = api.createCoupon.mock.calls[0][0];
  expect(payload.promotion_id).toBeNull();
});

test("filling Promotion ID sends it trimmed in the create payload, and shows the explanatory preview", async () => {
  api.createCoupon.mockResolvedValue({ coupon: { code: "LAUNCH100" } });
  await openCreateForm();
  fireEvent.change(screen.getByPlaceholderText(/SUMMER20/i), { target: { value: "launch100" } });
  fireEvent.change(screen.getByTestId("coupon-book-discount-value"), { target: { value: "100" } });
  fireEvent.change(screen.getByTestId("coupon-promotion-id"), { target: { value: "  public-launch-2026  " } });
  expect(screen.getByTestId("coupon-promotion-preview")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByText(/^Create Coupon$/i)); });
  await waitFor(() => expect(api.createCoupon).toHaveBeenCalled());
  const payload = api.createCoupon.mock.calls[0][0];
  expect(payload.promotion_id).toBe("public-launch-2026");
});

test("an existing promotion-limited coupon shows a 1-per-student badge and its promotion id in the expanded row", async () => {
  api.listCoupons.mockResolvedValue({
    coupons: [{
      code: "LAUNCH100", type: "percent", value: 100, max_uses: null, uses_count: 3,
      assigned_to: [], book_slugs: [], valid_from: null, expires_at: null, enabled: true,
      created_by: "admin@test", created_at: new Date().toISOString(), redemptions: [],
      benefit_type: "book_discount", benefit_amount: null, promotion_id: "public-launch-2026",
    }],
  });
  await act(async () => { render(<CouponStudio />); });
  await waitFor(() => expect(screen.queryByText(/Loading coupons/i)).toBeNull());
  expect(screen.getByTestId("coupon-promotion-badge-LAUNCH100")).toBeInTheDocument();
  // Expand the row to see the full promotion id.
  fireEvent.click(screen.getByTestId("coupon-expand-LAUNCH100"));
  expect(screen.getByTestId("coupon-promotion-id-LAUNCH100")).toHaveTextContent("public-launch-2026");
});

test("a coupon with no promotion_id shows no 1-per-student badge", async () => {
  api.listCoupons.mockResolvedValue({
    coupons: [{
      code: "PLAIN20", type: "percent", value: 20, max_uses: null, uses_count: 0,
      assigned_to: [], book_slugs: [], valid_from: null, expires_at: null, enabled: true,
      created_by: "admin@test", created_at: new Date().toISOString(), redemptions: [],
      benefit_type: "book_discount", benefit_amount: null, promotion_id: null,
    }],
  });
  await act(async () => { render(<CouponStudio />); });
  await waitFor(() => expect(screen.queryByText(/Loading coupons/i)).toBeNull());
  expect(screen.queryByTestId("coupon-promotion-badge-PLAIN20")).toBeNull();
});
