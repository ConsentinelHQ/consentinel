"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const SITE_KEY = process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"];

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void },
  ) => string;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Invisible-by-default challenge. Renders nothing when no site key is configured,
 * so local development needs no Cloudflare account.
 */
export function Turnstile({ onToken }: { onToken: (token: string | undefined) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!SITE_KEY || !scriptReady || !ref.current || !window.turnstile) return;
    window.turnstile.render(ref.current, {
      sitekey: SITE_KEY,
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(undefined),
    });
  }, [scriptReady, onToken]);

  if (!SITE_KEY) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={() => setScriptReady(true)}
      />
      <div ref={ref} style={{ marginTop: "1rem" }} />
    </>
  );
}
