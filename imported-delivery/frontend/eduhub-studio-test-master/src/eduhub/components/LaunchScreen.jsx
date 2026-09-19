/**
 * LaunchScreen.jsx — the EDUHUB STUDIO brand moment shown by BootGate.jsx
 * while the app verifies it's about to render the current version.
 *
 * A brand introduction, not a loading screen: no spinner, no progress bar,
 * no particles, no neon. EDUHUB and STUDIO settle into one identity with a
 * soft scale/opacity/tracking motion and a restrained static glow. Respects
 * prefers-reduced-motion (a instant cross-fade instead of the settle
 * motion). Unmounts the moment BootGate resolves — this component owns no
 * timing/version logic itself, only the visual.
 */
import { motion, useReducedMotion } from "framer-motion";
import { easing } from "../styles/tokens/motionTokens";

const BG = "radial-gradient(120% 90% at 50% 30%, #131A2B 0%, #0A0E18 60%, #06090F 100%)";
const GLOW = "radial-gradient(45% 35% at 50% 42%, rgba(228,201,122,0.14) 0%, transparent 70%)";
const GOLD = "#E4C97A";
const IVORY = "#F4F1E8";

export default function LaunchScreen() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      role="status"
      aria-label="Loading EduHub Studio"
      data-testid="eduhub-launch-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.35, ease: easing.premiumEaseOut }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BG,
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: GLOW, pointerEvents: "none" }} />

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <motion.span
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, letterSpacing: "0.02em", y: 6 }}
          animate={{ opacity: 1, letterSpacing: "0.08em", y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.6, ease: easing.premiumEaseOut }}
          style={{
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: "clamp(28px, 8vw, 40px)",
            fontWeight: 700,
            color: IVORY,
            letterSpacing: "0.08em",
          }}
        >
          EDUHUB
        </motion.span>

        <motion.div
          initial={reduceMotion ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : 0.35, ease: easing.premiumEaseOut }}
          style={{ width: 30, height: 1, background: GOLD, margin: "10px 0", transformOrigin: "center" }}
        />

        <motion.span
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, letterSpacing: "0.2em" }}
          animate={{ opacity: 1, letterSpacing: "0.42em" }}
          transition={{ duration: reduceMotion ? 0 : 0.7, delay: reduceMotion ? 0 : 0.28, ease: easing.premiumEaseOut }}
          style={{
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontSize: "clamp(10px, 2.4vw, 12px)",
            fontWeight: 600,
            color: GOLD,
            textTransform: "uppercase",
            paddingLeft: "0.42em", // offsets the letter-spacing so the word still optically centers
          }}
        >
          STUDIO
        </motion.span>
      </div>
    </motion.div>
  );
}
