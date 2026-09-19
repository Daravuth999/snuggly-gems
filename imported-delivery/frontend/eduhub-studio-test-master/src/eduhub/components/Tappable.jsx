// Tappable.jsx — Dashboard Polish Round 2, Feature 2: the ONE shared
// affordance wrapper for every genuinely interactive Dashboard block
// (wraps a real <Link>, <button>, or a real navigating onClick).
// Static/display-only panels never use this — the contrast between
// "visibly tappable" and "visibly quiet" is what actually solves the
// "can't tell what's clickable" problem, so wrapping a static block here
// would defeat the point.
//
// Reuses this dashboard's OWN motion vocabulary rather than inventing new
// numbers: spring.tap (motionTokens.js) is already the platform's named
// "snappy, settled press feedback — cards, buttons, badges" preset, and
// the idle shimmer's cadence is ambient.sweep (13s, motionTokens.js's own
// named cadence for "light sweeps"). The idle affordance is gated by
// useAmbientActive() — the SAME hook MyRankCard.jsx's ambient glow already
// uses — so it pauses off-screen, on a hidden tab, or under
// prefers-reduced-motion without this component re-deriving that logic.
//
// Usage: wrap the interactive element as-is; Tappable adds hover/tap/idle
// affordance around it without changing its own click behavior.
//   <Tappable className="rounded-2xl overflow-hidden">
//     <Link to="/library">...</Link>
//   </Tappable>
// The wrapper needs its OWN border-radius + overflow-hidden in className
// when the child has rounded corners, so the idle shimmer sweep clips to
// the same shape rather than spilling past it.
import { motion } from "framer-motion";
import { spring, ambient } from "../styles/tokens/motionTokens";
import useAmbientActive from "../hooks/useAmbientActive";

export default function Tappable({ children, className = "", style, ...rest }) {
  const { ref, active } = useAmbientActive();

  return (
    <motion.div
      ref={ref}
      data-testid="tappable"
      className={`eh-tappable relative ${className}`}
      style={style}
      whileHover={{ y: -3, scale: 1.015 }}
      whileTap={{ scale: 0.97, y: 0 }}
      transition={spring.tap}
      {...rest}
    >
      {children}
      {active && (
        <span aria-hidden data-testid="tappable-idle-cue" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <motion.span
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent dark:via-white/10"
            initial={{ x: "-120%" }}
            animate={{ x: "220%" }}
            transition={{ duration: 1.6, repeat: Infinity, repeatDelay: Math.max(0, ambient.sweep - 1.6), ease: "easeInOut" }}
          />
        </span>
      )}
    </motion.div>
  );
}
