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
 * Pinned card deck. The stage sticks under the nav while the section scrolls.
 * Each new card slides up from below and covers the last one, which shrinks,
 * dims and lifts so the deck reads as stacked behind it. Below 56rem, or with
 * reduced motion, it falls back to a plain list (CSS does that layout).
 */
export function StackCards({ cards }: { cards: readonly StackCard[] }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const stage = root.querySelector<HTMLElement>(".stack-stage");
    const items = Array.from(root.querySelectorAll<HTMLElement>(".stack-card"));
    const dots = Array.from(root.querySelectorAll<HTMLElement>(".stack-dots button"));
    if (!stage || items.length === 0) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 55.99rem)");
    const ease = (t: number): number => 1 - Math.pow(1 - t, 3);
    let frame = 0;
    let shown = 0; // eased position the deck is drawn at
    let last = -1;
    let prev = 0;
    const lens = root.querySelector<HTMLElement>(".stack-lens");

    const reset = (): void => {
      items.forEach((card) => {
        card.style.transform = "";
        card.style.removeProperty("--shade");
        card.classList.add("is-in");
      });
    };

    // Where scrolling says the deck should be: 0 at the first card, n - 1 at the last.
    const target = (): number => {
      const travel = Math.max(1, root.offsetHeight - stage.offsetHeight);
      const top = root.getBoundingClientRect().top;
      return Math.min(1, Math.max(0, -top / travel)) * (items.length - 1);
    };

    const draw = (p: number): void => {
      const stageH = stage.offsetHeight;
      items.forEach((card, i) => {
        if (p < i) {
          // Below the stage, easing up into place.
          const t = ease(Math.max(0, 1 - Math.min(1, i - p)));
          const y = (1 - t) * stageH;
          card.style.transform = `translate3d(0, calc(-50% + ${y.toFixed(2)}px), 0)`;
          card.style.setProperty("--shade", "0");
        } else {
          // In place, then pushed back as later cards arrive. Depth caps at 2.
          const d = Math.min(2, p - i);
          const lift = d * 26;
          const scale = 1 - d * 0.045;
          card.style.transform = `translate3d(0, calc(-50% - ${lift.toFixed(2)}px), 0) scale(${scale.toFixed(4)})`;
          card.style.setProperty("--shade", (d * 0.5).toFixed(3));
        }
        if (p > i - 0.35) card.classList.add("is-in");
      });
      // Glass lens glides between marks and stretches with speed, like a droplet.
      const now = Math.min(items.length - 1, Math.round(p));
      if (now !== last) {
        dots.forEach((dot, i) => {
          dot.toggleAttribute("data-on", i === now);
        });
        last = now;
      }
      if (lens && dots.length > 1) {
        // Measure the list items: the buttons' offsetParent is their own li.
        const first = dots[0]?.parentElement;
        const second = dots[1]?.parentElement;
        if (first && second) {
          const step = second.offsetTop - first.offsetTop;
          const speed = Math.min(1, Math.abs(p - prev) * 14);
          lens.style.transform = `translate3d(-50%, ${(first.offsetTop + first.offsetHeight / 2 + p * step).toFixed(2)}px, 0) translateY(-50%) scale(${(1 - speed * 0.18).toFixed(3)}, ${(1 + speed * 0.55).toFixed(3)})`;
        }
      }
      prev = p;
    };

    // Chase the scroll position instead of jumping to it, so wheel steps glide.
    const tick = (): void => {
      frame = 0;
      if (still.matches) {
        reset();
        return;
      }
      const goal = target();
      shown += (goal - shown) * 0.14;
      if (Math.abs(goal - shown) < 0.0005) shown = goal;
      draw(shown);
      if (shown !== goal) frame = window.requestAnimationFrame(tick);
    };

    const onScroll = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(tick);
    };

    shown = still.matches ? 0 : target();
    if (still.matches) reset();
    else draw(shown);
    const jumps = dots.map((dot, i) => {
      const go = (): void => {
        const travel = root.offsetHeight - stage.offsetHeight;
        const top = root.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({
          top: top + (travel * i) / Math.max(1, items.length - 1),
          behavior: "smooth",
        });
      };
      dot.addEventListener("click", go);
      return () => {
        dot.removeEventListener("click", go);
      };
    });

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    still.addEventListener("change", onScroll);
    return () => {
      jumps.forEach((off) => {
        off();
      });
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
        <ol className="stack-dots">
          {cards.map((card, i) => (
            <li key={card.title}>
              <button
                aria-label={`Show finding ${String(i + 1)}: ${card.title}`}
                data-on={i === 0 ? "" : undefined}
                type="button"
              />
            </li>
          ))}
          <li aria-hidden="true" className="stack-lens" />
        </ol>
      </div>
    </div>
  );
}
