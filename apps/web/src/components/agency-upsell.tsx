import Link from "next/link";

const SAMPLE = [
  { host: "northwind-apparel.com", client: "Northwind", n: 14, w: 100 },
  { host: "harbor-coffee.co", client: "Harbor", n: 9, w: 64 },
  { host: "lumen-skin.com", client: "Lumen", n: 4, w: 29 },
  { host: "fernhome.com", client: "Fern", n: 0, w: 0 },
];

/** Locked state for Agency pages: show the product, not a padlock. */
export function AgencyUpsell({ title, points }: { title: string; points: string[] }) {
  return (
    <div className="upsell">
      <div className="upsell-copy">
        <span className="upsell-tag">Agency</span>
        <h2>{title}</h2>
        <ul>
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <Link className="dash-cta" href="/app/billing">
          See the Agency plan
        </Link>
      </div>
      <div aria-hidden className="upsell-preview">
        {SAMPLE.map((r, i) => (
          <div className="upsell-row" key={r.host} style={{ ["--i" as string]: i }}>
            <span className={r.n > 0 ? "pf-dot is-critical" : "pf-dot is-clean"} />
            <span className="upsell-host">{r.host}</span>
            <span className="upsell-client">{r.client}</span>
            <span className="pf-meter-track">
              <span className="pf-meter-fill" style={{ width: `${String(r.w)}%` }} />
            </span>
            <span className="upsell-n">{r.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
