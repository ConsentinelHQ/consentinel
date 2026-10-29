"use client";

import { useEffect, useState } from "react";

type Layer = boolean | null;
type State = { status: "checking" } | { status: "done"; js: boolean; header: Layer };

// Browsers that ship the setting, and where to find it.
const ENABLE: { name: string; how: string }[] = [
  { name: "Brave", how: "On by default." },
  { name: "DuckDuckGo", how: "On by default." },
  {
    name: "Firefox",
    how: "Settings, Privacy & Security, then turn on “Tell websites not to sell or share my data.”",
  },
  {
    name: "Chrome, Safari, Edge",
    how: "If there's no built-in setting yet, add an extension that sends it, like Privacy Badger.",
  },
];

/**
 * Live test of the visitor's own browser, on both layers a site can read:
 * the Sec-GPC request header and navigator.globalPrivacyControl.
 */
export function BrowserGpcCheck() {
  const [state, setState] = useState<State>({ status: "checking" });

  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    const js = nav.globalPrivacyControl === true;
    let alive = true;

    // Short floor so the check reads as a check, not a flash.
    const floor = new Promise((r) => setTimeout(r, 700));
    const probe = fetch("/api/gpc-signal", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ header?: boolean }>)
      .then((d): Layer => d.header === true)
      .catch((): Layer => null);

    void Promise.all([probe, floor]).then(([header]) => {
      if (alive) setState({ status: "done", js, header });
    });
    return () => {
      alive = false;
    };
  }, []);

  const on = state.status === "done" && (state.js || state.header === true);
  const verdict =
    state.status === "checking"
      ? "Checking"
      : on
        ? "Your browser is sending GPC"
        : "Your browser isn't sending GPC";

  return (
    <section aria-live="polite" className={`bgpc bgpc-${state.status}${on ? " on" : ""}`}>
      <div className="bgpc-head">
        <span className="bgpc-kicker">
          <span aria-hidden="true" className="bgpc-signal" />
          Live browser check
        </span>
        <span className="bgpc-verdict">{verdict}</span>
      </div>

      <ul className="bgpc-layers">
        <LayerRow
          label="Sec-GPC header"
          detail="Sent with every request"
          value={state.status === "done" ? state.header : undefined}
        />
        <LayerRow
          label="navigator.globalPrivacyControl"
          detail="Read by page scripts"
          value={state.status === "done" ? state.js : undefined}
        />
      </ul>

      {state.status === "done" && !on && (
        <div className="bgpc-enable">
          <p className="bgpc-enable-title">How to turn it on</p>
          <dl>
            {ENABLE.map(({ name, how }) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{how}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {state.status === "done" && (
        <p className="bgpc-next">
          {on
            ? "Your browser is opting you out. The real question is whether sites obey it."
            : "Once it's on, every site you visit gets the opt-out. Whether they obey it is another matter."}{" "}
          <a href="#site-check">Test a site</a>
        </p>
      )}
    </section>
  );
}

function LayerRow({
  label,
  detail,
  value,
}: {
  label: string;
  detail: string;
  value: Layer | undefined;
}) {
  const text = value === undefined ? "..." : value === null ? "Unknown" : value ? "On" : "Off";
  const tone = value === undefined || value === null ? "" : value ? " on" : " off";
  return (
    <li className="bgpc-layer">
      <div>
        <code>{label}</code>
        <span>{detail}</span>
      </div>
      <span className={`bgpc-pill${tone}`}>{text}</span>
    </li>
  );
}
