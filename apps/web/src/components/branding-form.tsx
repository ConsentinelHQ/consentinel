"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

interface Brand {
  brandName: string;
  brandLogoUrl: string;
  brandColor: string;
  brandWebsite: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Edits the agency brand with a live preview of the shared report header. */
export function BrandingForm({ initial }: { initial: Brand }) {
  const router = useRouter();
  const [brand, setBrand] = useState<Brand>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [logoOk, setLogoOk] = useState(true);

  const set = (key: keyof Brand) => (value: string) => {
    setBrand((b) => ({ ...b, [key]: value }));
    if (key === "brandLogoUrl") setLogoOk(true);
    setMessage(null);
  };

  const color = HEX.test(brand.brandColor) ? brand.brandColor : "#1d1d1f";
  const showLogo = brand.brandLogoUrl.startsWith("https://") && logoOk;

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/branding", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(brand),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage({ text: data.error ?? "Couldn’t save.", error: true });
      } else {
        setMessage({
          text:
            brand.brandName.trim() === ""
              ? "Saved. Shared reports use Consentinel branding."
              : "Saved. Every share link now shows your brand.",
          error: false,
        });
        router.refresh();
      }
    } catch {
      setMessage({ text: "Couldn’t reach the server.", error: true });
    }
    setBusy(false);
  }

  return (
    <div className="brand-grid">
      <form className="panel brand-form" onSubmit={(e) => void save(e)}>
        <label>
          <span>Agency name</span>
          <input
            maxLength={80}
            onChange={(e) => set("brandName")(e.target.value)}
            placeholder="Northwind Digital"
            value={brand.brandName}
          />
          <small>Leave empty to switch white-label off.</small>
        </label>
        <label>
          <span>Logo URL</span>
          <input
            onChange={(e) => set("brandLogoUrl")(e.target.value)}
            placeholder="https://youragency.com/logo.svg"
            type="url"
            value={brand.brandLogoUrl}
          />
          <small>
            {logoOk
              ? "SVG or PNG, about 32px tall. Hosted on your site."
              : "That image didn’t load."}
          </small>
        </label>
        <label>
          <span>Accent color</span>
          <span className="brand-color">
            <input
              aria-label="Pick a color"
              onChange={(e) => set("brandColor")(e.target.value)}
              type="color"
              value={color}
            />
            <input
              maxLength={7}
              onChange={(e) => set("brandColor")(e.target.value)}
              placeholder="#1f6feb"
              value={brand.brandColor}
            />
          </span>
        </label>
        <label>
          <span>Website</span>
          <input
            onChange={(e) => set("brandWebsite")(e.target.value)}
            placeholder="https://youragency.com"
            type="url"
            value={brand.brandWebsite}
          />
          <small>Your logo links here on shared reports.</small>
        </label>
        <div className="brand-actions">
          <button className="pf-button" disabled={busy} type="submit">
            {busy ? "Saving..." : "Save branding"}
          </button>
          {message !== null && (
            <p className={message.error ? "form-error" : "brand-saved"} role="status">
              {message.text}
            </p>
          )}
        </div>
      </form>

      <div aria-label="Preview" className="brand-preview" style={{ ["--brand" as string]: color }}>
        <div className="brand-preview-bar">
          <span className="brand-preview-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="brand-preview-url">Shared report</span>
        </div>
        <div className="wl-header is-preview">
          <span className="wl-mark">
            {showLogo ? (
              <img
                alt=""
                height={28}
                onError={() => setLogoOk(false)}
                referrerPolicy="no-referrer"
                src={brand.brandLogoUrl}
              />
            ) : (
              <span className="wl-initial">{(brand.brandName.trim()[0] ?? "A").toUpperCase()}</span>
            )}
            <span>{brand.brandName.trim() || "Your agency"}</span>
          </span>
          <span className="wl-tag">Privacy compliance report</span>
        </div>
        <div className="brand-preview-body">
          <span className="brand-line is-wide" />
          <span className="brand-line" />
          <span className="brand-finding">
            <i />
            <span className="brand-line is-short" />
          </span>
          <span className="brand-finding">
            <i />
            <span className="brand-line is-short" />
          </span>
          <span className="brand-finding is-ok">
            <i />
            <span className="brand-line is-short" />
          </span>
        </div>
        <div className="wl-footer is-preview">
          Prepared by {brand.brandName.trim() || "your agency"}
        </div>
      </div>
    </div>
  );
}
