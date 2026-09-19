// ScrollToTop.jsx — floating scroll-to-top button shown above TelegramFab when scroll>300.
//
// Dashboard Polish Round 2, Feature 3 — this button used to sit at a flat
// `bottom-[148px]` on every breakpoint: no `--eduhub-bottom-nav-h`
// (layout-vars.css), no `env(safe-area-inset-bottom)`, no `lg` gate for
// when MobileBottomNav.jsx (lg:hidden) actually disappears. 148px was
// tuned to sit above TelegramFab's OLD (also-hardcoded) position, so
// fixing TelegramFab's own offset without fixing this one would have
// put them out of alignment again — same shared-variable contract
// applied here for consistency, plus the same TelegramFab height/gap
// (48px button + 14px gap) stacked on top of TelegramFab's own offset.
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { useScrollProgress } from "../hooks/useScrollProgress";

const BOTTOM_MOBILE = "bottom-[calc(var(--eduhub-bottom-nav-h,64px)_+_env(safe-area-inset-bottom,0px)_+_78px)]";
const BOTTOM_DESKTOP = "lg:bottom-[80px]";

export default function ScrollToTop() {
  const progress = useScrollProgress();
  // useScrollProgress returns 0..1 ; we want raw scrollY > 300.
  const visible = typeof window !== "undefined" && window.scrollY > 300 && progress > 0.05;

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="scroll-top"
          initial={{ opacity: 0, scale: 0.6, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 10 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Scroll to top"
          data-testid="scroll-to-top-btn"
          className={`fixed ${BOTTOM_MOBILE} ${BOTTOM_DESKTOP} right-5 z-30 h-11 w-11 rounded-full border border-aurora-cyan/40 bg-black/60 backdrop-blur-md text-aurora-cyan hover:text-white hover:bg-aurora-violet/30 transition flex items-center justify-center shadow-[0_10px_30px_-8px_rgba(0,224,255,0.5)]`}
        >
          <ArrowUp className="h-5 w-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
