"use client";

import { useEffect, useRef, useState } from "react";
import type { FreeReport } from "@/lib/free-report";
import { OPEN_SECTION_EVENT } from "./collapsible-section";

interface Item {
  id: string;
  label: string;
  /** Short count or score next to the label. */
  badge?: string;
  tone: "bad" | "good" | "neutral";
}

/** Sections the report actually has, in page order. */
export function jumpItems(report: FreeReport): Item[] {
  const items: Item[] = [];
  const findings = report.counts.critical + report.counts.warning;
  items.push({
    id: "report-findings",
    label: "Findings",
    badge: String(findings),
    tone: report.counts.critical > 0 ? "bad" : "good",
  });
  if (report.gpcCheck) {
    const n = report.gpcCheck.ignoredBy.length;
    items.push({
      id: "report-gpc",
      label: "Opt-out signal",
      badge: n === 0 ? "pass" : String(n),
      tone: n === 0 ? "good" : "bad",
    });
  }
  if (report.disclosure) {
    const d = report.disclosure;
    const n = d.notNamed.length;
    const ok = d.status === "checked" && n === 0;
    items.push({
      id: "report-disclosure",
      label: "Disclosure",
      badge: d.status === "checked" ? (n === 0 ? "pass" : String(n)) : "check",
      tone: ok ? "good" : "bad",
    });
  }
  if (report.gtm) {
    const n = report.gtm.containers.reduce((sum, c) => sum + c.unguarded, 0);
    items.push({
      id: "report-gtm",
      label: "Tag Manager",
      badge: n === 0 ? "pass" : String(n),
      tone: n === 0 ? "good" : "bad",
    });
  }
  if (report.accessibility) {
    const s = report.accessibility.score;
    items.push({
      id: "report-accessibility",
      label: "Accessibility",
      badge: String(s),
      tone: s >= 90 ? "good" : s >= 60 ? "neutral" : "bad",
    });
  }
  return items;
}

/**
 * Sticky jump bar for the report. The report runs long now (findings, GPC,
 * disclosure, GTM, accessibility), so people jump to the part they own.
 */
export function ReportJump({ report }: { report: FreeReport }) {
  const items = jumpItems(report);
  const [active, setActive] = useState(items[0]?.id ?? "");
  const barRef = useRef<HTMLElement>(null);
  const ids = items.map((i) => i.id).join(",");

  useEffect(() => {
    const els = ids
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    // The section whose top most recently crossed the upper third of the screen.
    const onScroll = (): void => {
      const line = window.innerHeight * 0.33;
      let current = els[0]?.id ?? "";
      for (const el of els) if (el.getBoundingClientRect().top <= line) current = el.id;
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ids]);

  // Keep the active chip in view on narrow screens, where the bar scrolls sideways.
  useEffect(() => {
    const chip = barRef.current?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    chip?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [active]);

  if (items.length < 2) return null;

  return (
    <nav aria-label="Report sections" className="report-jump" ref={barRef}>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a
              aria-current={active === item.id ? "location" : undefined}
              className={`report-jump-link${active === item.id ? " is-active" : ""}`}
              data-id={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                const el = document.getElementById(item.id);
                if (!el) return;
                e.preventDefault();
                // Open it first if it was folded, then scroll once it has height.
                window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: item.id }));
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                history.replaceState(null, "", `#${item.id}`);
                setActive(item.id);
              }}
            >
              {item.label}
              {item.badge && <span className={`report-jump-badge ${item.tone}`}>{item.badge}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
