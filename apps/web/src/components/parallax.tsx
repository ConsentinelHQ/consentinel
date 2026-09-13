"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * One orchestrated scroll moment, not effects scattered over every section.
 * Transform only, driven by rAF, and switched off entirely for reduced motion.
 */
export function Parallax({ speed = 0.12, children }: { speed?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const update = (): void => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const fromCenter = rect.top + rect.height / 2 - window.innerHeight / 2;
      node.style.transform = `translate3d(0, ${(-fromCenter * speed).toFixed(1)}px, 0)`;
    };
    const onScroll = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [speed]);

  return <div ref={ref}>{children}</div>;
}
