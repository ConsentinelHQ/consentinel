"use client";

import { useEffect, useRef } from "react";
import { startFluid } from "@/lib/fluid-sim";

/**
 * Cursor-driven fluid behind the hero. Fixed to the viewport (the sim uses
 * clientX/clientY), faded out by a scroll-driven mask: solid until `fadeFrom`,
 * gone by the bottom of `fadeTo`. Paused once that point scrolls past.
 * Skipped for reduced motion and touch-only devices.
 */
export function FluidCursor({ fadeFrom, fadeTo }: { fadeFrom: string; fadeTo: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const from = document.getElementById(fadeFrom);
    const to = document.getElementById(fadeTo);
    if (!wrap || !from || !to) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    // Fresh canvas per run: a stopped sim loses its GL context for good.
    const canvas = document.createElement("canvas");
    wrap.appendChild(canvas);
    wrap.style.display = "block"; // sim sizes itself from the canvas on start
    let fluid: ReturnType<typeof startFluid>;
    try {
      fluid = startFluid(canvas);
    } catch {
      canvas.remove();
      wrap.style.display = "";
      return; // no WebGL: page stays plain white
    }

    let frame = 0;
    const apply = (): void => {
      frame = 0;
      const a = from.getBoundingClientRect().top;
      const b = to.getBoundingClientRect().bottom;
      const mask = `linear-gradient(to bottom, #000 0px, #000 ${a}px, transparent ${b}px)`;
      wrap.style.maskImage = mask;
      wrap.style.webkitMaskImage = mask;
      fluid.setPaused(b <= 0);
    };
    const onScroll = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      fluid.stop();
      canvas.remove();
      wrap.style.display = "";
    };
  }, [fadeFrom, fadeTo]);

  return <div aria-hidden="true" className="fluid-cursor" ref={wrapRef} />;
}
