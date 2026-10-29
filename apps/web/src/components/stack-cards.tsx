"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export type StackCard = {
  eyebrow: string;
  title: string;
  body: string;
  chip: string;
  visual: ReactNode;
};

/**
 * Cards pin under the nav and stack as you scroll. Each one shrinks and dims a
 * little as the next covers it. Sticky does the layout; JS only sets a scale.
 */
export function StackCards({ cards }: { cards: readonly StackCard[] }) {
  const ref = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(".stack-card"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach((card) => card.classList.add("is-in"));
      return;
    }

    // Evidence lines type in once a card is mostly on screen.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.45 },
    );
    items.forEach((card) => {
      io.observe(card);
    });
    let frame = 0;

    const update = (): void => {
      frame = 0;
      items.forEach((card, i) => {
        const next = items[i + 1];
        if (!next) return;
        // 0 when the next card starts covering this one, 1 when fully covered.
        const top = card.getBoundingClientRect().top;
        const nextTop = next.getBoundingClientRect().top;
        const h = card.offsetHeight || 1;
        const p = Math.min(1, Math.max(0, 1 - (nextTop - top) / h));
        card.style.setProperty("--covered", p.toFixed(3));
      });
    };
    const onScroll = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <ol className="stack" ref={ref}>
      {cards.map((card, i) => (
        <li className="stack-card" key={card.title} style={{ "--i": i } as CSSProperties}>
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
  );
}
