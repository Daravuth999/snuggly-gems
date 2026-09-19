/**
 * AvailableCouponsPanel.jsx — §3 (2026-09): proactive display of the
 * student's currently-usable Video Library coupons on the browse page.
 *
 * Distinct from VideoLibraryCouponCard.jsx's "Have a voucher?" link: that
 * component is REACTIVE (the student must already have a code in hand to
 * type in); this one is PROACTIVE — it shows coupons the student can use
 * RIGHT NOW without them knowing a code exists at all. The two coexist:
 * this panel surfaces what's available, the existing card still handles
 * manual code entry for anything not shown here (e.g. a code shared
 * outside the app).
 *
 * Talks ONLY to GET /api/video/coupons (video_library_coupon_tools.
 * list_available_coupons) via videoLibraryApi.js — every entry returned is
 * already server-verified as actually redeemable/applicable right now
 * (respects enabled/expiry/assigned_to/max_uses/already-used exactly as
 * the redeem and purchase paths enforce them); this component never
 * re-derives or second-guesses that itself. Renders nothing at all — not
 * even an empty-state — when the list is empty, so a student with no
 * coupons never sees a dead panel.
 *
 * Visual language extends videoLibrary.css's existing `vl-` system (the
 * SAME gold accent, `.vl-rise` entrance, `.vl-card` glow-on-hover already
 * used throughout this page) rather than introducing a new one.
 */
import { useEffect, useState } from "react";
import { Percent, Coins, Ticket } from "lucide-react";
import { listAvailableVideoLibraryCoupons } from "./videoLibraryApi";
import "./videoLibrary.css";

const GOLD = "#D4A843";

function fmtExpiry(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

function CouponChip({ coupon, index }) {
  const isPercent = coupon.type === "percent";
  return (
    <div
      className="vl-card vl-rise flex-none w-[168px] rounded-xl border border-white/10 bg-white/[0.03] p-3"
      style={{ animationDelay: `${index * 60}ms` }}
      data-testid={`available-coupon-${coupon.code}`}
      data-coupon-type={coupon.type}
    >
      <div className="flex items-center gap-1.5 mb-2">
        {isPercent ? <Percent size={13} style={{ color: GOLD }} /> : <Coins size={13} style={{ color: GOLD }} />}
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: GOLD }}>
          {isPercent ? "Discount" : "Bonus points"}
        </span>
      </div>
      <div className="text-[19px] font-bold text-white leading-none mb-1">
        {isPercent ? `${coupon.percentOff}% off` : `+${coupon.benefitAmount} pts`}
      </div>
      <div className="text-[11px] text-white/45 mb-2">
        {isPercent ? "a video lesson purchase" : "restricted · Video Library only"}
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-bold tracking-wider text-white/70">{coupon.code}</span>
        {fmtExpiry(coupon.expiresAt) && (
          <span className="text-[10px] text-white/35">till {fmtExpiry(coupon.expiresAt)}</span>
        )}
      </div>
    </div>
  );
}

export default function AvailableCouponsPanel() {
  const [coupons, setCoupons] = useState([]);

  useEffect(() => {
    let cancelled = false;
    listAvailableVideoLibraryCoupons().then((list) => {
      if (!cancelled) setCoupons(Array.isArray(list) ? list : []);
    });
    return () => { cancelled = true; };
  }, []);

  if (coupons.length === 0) return null;

  return (
    <div className="mb-5" data-testid="available-coupons-panel">
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        <Ticket size={14} style={{ color: GOLD }} />
        <h2 className="text-[12.5px] font-bold uppercase tracking-wider text-white/70">
          Your Vouchers
        </h2>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-0.5 px-0.5" style={{ scrollbarWidth: "none" }}>
        {coupons.map((c, i) => <CouponChip key={c.code} coupon={c} index={i} />)}
      </div>
    </div>
  );
}
