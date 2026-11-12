import { ImageResponse } from "next/og";

export const alt = "Consentinel: find the accessibility and privacy issues on your site";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ROWS: { tone: "red" | "amber" | "green"; text: string; tag: string }[] = [
  { tone: "red", text: "14 product images missing alt text", tag: "wcag" },
  { tone: "red", text: "Meta Pixel fired after Reject all", tag: "meta" },
  { tone: "amber", text: "Text contrast too low on 22 elements", tag: "wcag" },
  { tone: "green", text: "TikTok Pixel waited for consent", tag: "tiktok" },
];
const COLOR = { red: "#d70015", amber: "#b25000", green: "#00795c" } as const;

// Link previews in Slack, iMessage and social. Clean and white, like the site.
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: "linear-gradient(135deg, #ffffff 55%, #fdf0f2 80%, #eef1ff 100%)",
        color: "#1d1d1f",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 600 }}>
        Consentinel
      </div>
      <div style={{ display: "flex", gap: 56, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
          <div style={{ fontSize: 60, lineHeight: 1.05, letterSpacing: -2, fontWeight: 600 }}>
            Find the accessibility and privacy issues on your site.
          </div>
          <div style={{ fontSize: 26, color: "#6e6e73", marginTop: 24 }}>
            One free scan. Every issue, with the fix.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 460,
            borderRadius: 20,
            border: "1px solid #d2d2d7",
            background: "#ffffff",
            boxShadow: "0 24px 60px rgba(29,29,31,0.12)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "18px 22px",
              borderBottom: "1px solid #e5e5ea",
              fontSize: 18,
              color: "#6e6e73",
            }}
          >
            <span>yourstore.com</span>
            <span style={{ color: COLOR.red, fontWeight: 600 }}>3 critical</span>
          </div>
          {ROWS.map((r) => (
            <div
              key={r.text}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "16px 22px",
                borderBottom: "1px solid #f0f0f2",
                borderLeft: `5px solid ${COLOR[r.tone]}`,
                fontSize: 19,
              }}
            >
              <span style={{ flex: 1 }}>{r.text}</span>
              <span style={{ color: "#8e8e93", fontSize: 16 }}>{r.tag}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 20, color: "#6e6e73" }}>getconsentinel.com</div>
    </div>,
    size,
  );
}
