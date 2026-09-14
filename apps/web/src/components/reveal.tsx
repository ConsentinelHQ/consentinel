"use client";

import { useEffect } from "react";

/**
 * Adds .is-in to [data-reveal] elements as they enter the viewport.
 *
 * Scroll-driven CSS timelines were tried first and complete too fast on tall
 * sections. An observer gives a predictable trigger point.
 */
export function Reveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    // forEach, not for-of: NodeListOf is not iterable under this tsconfig target.
    els.forEach((el) => {
      io.observe(el);
    });
    return () => {
      io.disconnect();
    };
  }, []);

  return null;
}
