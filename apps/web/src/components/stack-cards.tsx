"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type StackCard = {
  eyebrow: string;
  title: string;
  body: string;
  chip: string;
  visual: ReactNode;
};

/**
 * Pinned card deck. The stage sticks under the nav while the section scrolls.
 * Each new card slides up from below and covers the last one, which shrinks,
 * blurs and lifts so the deck reads as stacked behind it. Below 56rem, or with
 * reduced motion, it falls back to a plain list (CSS does that layout).
 */
export function StackCards({ cards }: { cards: readonly StackCard[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const stage = root.querySelector<HTMLElement>(".stack-stage");
    const items = Array.from(root.querySelectorAll<HTMLElement>(".stack-card"));
    if (!stage || items.length === 0) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 55.99rem)");
    let frame = 0;

    const reset = (): void => {
      items.forEach((card) => {
        card.style.transform = "";
        card.style.filter = "";
        card.classList.add("is-in");
      });
    };

    const update = (): void => {
      frame = 0;
      if (still.matches) {
        reset();
        return;
      }
      const rect = root.getBoundingClientRect();
      const stageH = stage.offsetHeight;
      const travel = Math.max(1, root.offsetHeight - stageH);
      // 0 at the first card, n - 1 at the last.
      const p = Math.min(1, Math.max(0, -rect.top / travel)) * (items.length - 1);

      items.forEach((card, i) => {
        if (p < i) {
          // Still below the stage, sliding up into place.
          const t = Math.min(1, i - p);
          card.style.transform = `translate3d(0, calc(-50% + ${(t * stageH).toFixed(1)}px), 0)`;
          card.style.filter = "";
        } else {
          // In place, then pushed back as later cards arrive. Depth caps at 2.
          const d = Math.min(2, p - i);
          const lift = d * 26;
          const scale = 1 - d * 0.045;
          card.style.transform = `translate3d(0, calc(-50% - ${lift.toFixed(1)}px), 0) scale(${scale.toFixed(4)})`;
          card.style.filter = d > 0.02 ? `blur(${(d * 1.6).toFixed(2)}px)` : "";
        }
        if (p > i - 0.35) card.classList.add("is-in");
      });
      setActive(Math.min(items.length - 1, Math.round(p)));
    };

    const onScroll = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    still.addEventListener("change", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      still.removeEventListener("change", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="stack" ref={rootRef} style={{ "--n": cards.length } as CSSProperties}>
      <div className="stack-stage">
        <ol className="stack-deck">
          {cards.map((card, i) => (
            <li className="stack-card" key={card.title} style={{ zIndex: i + 1 }}>
              <div className="stack-copy">
                <p className="eyebrow">{card.eyebrow}</p>
                <h3>{card.title}</h3>
                <p className="stack-body">{card.body}</p>
                <span className="chip">{card.chip}</span>
              </div>
              <div className="stack-visual" aria-hidden="true">
                {card.visual}
              </div>
            </li>
          ))}
        </ol>
        <ol aria-hidden="true" className="stack-dots">
          {cards.map((card, i) => (
            <li data-on={i <= active ? "" : undefined} key={card.title} />
          ))}
        </ol>
      </div>
    </div>
  );
}
