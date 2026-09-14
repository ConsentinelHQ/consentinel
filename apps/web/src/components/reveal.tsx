"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Adds .is-in to [data-reveal] elements as they enter the viewport.
 *
 * Content starts at opacity 0, so every failure mode here is a blank page.
 * That makes the failsafes below more important than the animation itself.
 */
export function Reveal() {
  // Client navigation does not remount the layout. Without re-running on
  // pathname change, the next page's elements are never observed.
  const pathname = usePathname();

  useEffect(() => {
    const reveal = (el: Element): void => {
      el.classList.add("is-in");
    };
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");

    if (els.length === 0) return;

    // Reduced motion: show everything immediately, no observer.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach(reveal);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target);
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );

    // forEach, not for-of: NodeListOf is not iterable under this tsconfig target.
    els.forEach((el) => {
      io.observe(el);
    });

    // Anything already on screen should be visible now, not after a scroll event.
    requestAnimationFrame(() => {
      els.forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) reveal(el);
      });
    });

    // Last resort. A missing animation is a nuisance; invisible content is a
    // broken page, so after 2s we stop caring why the observer did not fire.
    const failsafe = window.setTimeout(() => {
      els.forEach(reveal);
    }, 2000);

    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [pathname]);

  return null;
}
