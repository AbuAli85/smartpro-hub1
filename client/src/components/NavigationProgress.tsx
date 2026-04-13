/**
 * NavigationProgress
 *
 * A thin top-bar progress bar that fires on every wouter route change.
 * Strategy:
 *  1. When the location changes, start a fast "indeterminate" sweep from 0 → 85 %
 *     over ~400 ms using a CSS animation.
 *  2. After a short settle delay (300 ms) we snap to 100 % and fade out.
 *
 * This gives instant visual feedback without needing to know when the new
 * page has actually finished rendering — which is the same approach used by
 * GitHub, YouTube, and Next.js.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

type Phase = "idle" | "loading" | "completing" | "done";

export default function NavigationProgress() {
  const [location] = useLocation();
  const [phase, setPhase] = useState<Phase>("idle");
  const [width, setWidth] = useState(0);
  const prevLocation = useRef(location);
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip the very first mount — no navigation has happened yet.
    if (prevLocation.current === location) return;
    prevLocation.current = location;

    // Clear any in-flight timers from a rapid navigation.
    if (completeTimer.current) clearTimeout(completeTimer.current);
    if (doneTimer.current) clearTimeout(doneTimer.current);

    // 1. Start: jump to a small seed width and enter loading phase.
    setWidth(10);
    setPhase("loading");

    // 2. After a brief moment, advance to 85 % (CSS transition handles the
    //    smooth interpolation between the current width and 85).
    const advanceTimer = setTimeout(() => setWidth(85), 50);

    // 3. Complete: snap to 100 % after the page has had time to paint.
    completeTimer.current = setTimeout(() => {
      setWidth(100);
      setPhase("completing");
    }, 350);

    // 4. Fade out and reset.
    doneTimer.current = setTimeout(() => {
      setPhase("done");
      // Reset width after the fade-out transition finishes.
      setTimeout(() => {
        setWidth(0);
        setPhase("idle");
      }, 300);
    }, 700);

    return () => {
      clearTimeout(advanceTimer);
      if (completeTimer.current) clearTimeout(completeTimer.current);
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, [location]);

  if (phase === "idle") return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        height: "3px",
        pointerEvents: "none",
      }}
    >
      {/* Track */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "transparent",
        }}
      />
      {/* Bar */}
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: "linear-gradient(90deg, #c0392b 0%, #e74c3c 50%, #ff6b6b 100%)",
          boxShadow: "0 0 8px 1px rgba(231, 76, 60, 0.6)",
          transition:
            phase === "loading"
              ? "width 350ms cubic-bezier(0.4, 0, 0.2, 1)"
              : phase === "completing"
              ? "width 200ms ease-out"
              : "none",
          opacity: phase === "done" ? 0 : 1,
          // Fade-out transition
          ...(phase === "done" && {
            transition: "opacity 250ms ease-out",
          }),
        }}
      />
      {/* Glow dot at the leading edge */}
      <div
        style={{
          position: "absolute",
          top: "-1px",
          left: `calc(${width}% - 4px)`,
          width: "8px",
          height: "5px",
          borderRadius: "50%",
          background: "#ff6b6b",
          boxShadow: "0 0 10px 3px rgba(255, 107, 107, 0.8)",
          opacity: phase === "done" ? 0 : 1,
          transition:
            phase === "loading"
              ? "left 350ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms"
              : phase === "completing"
              ? "left 200ms ease-out, opacity 250ms"
              : "opacity 250ms",
        }}
      />
    </div>
  );
}
