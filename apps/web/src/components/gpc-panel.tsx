import type { FreeReport } from "@/lib/free-report";

type GpcCheck = NonNullable<FreeReport["gpcCheck"]>;

/**
 * The browser opt-out test. Shown on every report that ran it, clean or not,
 * because "your tags stop when the browser opts out" is the answer a buyer
 * needs before Chrome starts sending the signal.
 */
export function GpcPanel({ check }: { check: GpcCheck }) {
  const ignored = check.ignoredBy.length;
  const verdict =
    ignored === 0
      ? "Every ad tag stopped"
      : `${String(ignored)} ad ${ignored === 1 ? "vendor" : "vendors"} ignored it`;

  return (
    <section aria-labelledby="gpc-test-title" className="gpc-test">
      <div className="gpc-test-head">
        <div>
          <span className="gpc-test-kicker">
            <span aria-hidden="true" className="gpc-test-signal" />
            Browser opt-out test
          </span>
          <h2 className="gpc-test-title" id="gpc-test-title">
            Global Privacy Control
          </h2>
        </div>
        <span className={`gpc-test-verdict${ignored === 0 ? " pass" : ""}`}>{verdict}</span>
      </div>

      <p className="gpc-test-lede">
        We loaded the page with Global Privacy Control on and didn’t touch the banner. From January
        1, 2027, California requires every browser to offer this setting, so this is how most
        opt-outs will arrive.
      </p>

      <div className="gpc-test-cols">
        <VendorList
          empty="Nothing kept running."
          label="Kept running"
          tone="bad"
          vendors={check.ignoredBy}
        />
        <VendorList
          empty={
            ignored === 0 ? "No ad tags ran with consent either." : "None of the ad tags stopped."
          }
          label="Stopped"
          tone="good"
          vendors={check.stoppedBy}
        />
      </div>

      <p className={`gpc-test-ack${check.acknowledged ? " ok" : ""}`}>
        <span aria-hidden="true" className="gpc-test-ack-mark">
          {check.acknowledged ? "✓" : "✕"}
        </span>
        {check.acknowledged
          ? `The page confirmed the opt-out: "${check.acknowledgment ?? "Opt-Out Request Honored"}".`
          : ignored > 0
            ? "The page didn’t confirm the opt-out. California requires showing whether the signal was honored."
            : "The page didn’t show an opt-out confirmation."}
      </p>
    </section>
  );
}

function VendorList({
  label,
  vendors,
  tone,
  empty,
}: {
  label: string;
  vendors: string[];
  tone: "good" | "bad";
  empty: string;
}) {
  return (
    <div className="gpc-test-col">
      <h3 className="gpc-test-col-label">{label}</h3>
      {vendors.length === 0 ? (
        <p className="gpc-test-empty">{empty}</p>
      ) : (
        <ul className="gpc-test-list">
          {vendors.map((v, i) => (
            <li
              className={`gpc-test-chip ${tone}`}
              key={v}
              style={{ animationDelay: `${String(120 + i * 70)}ms` }}
            >
              <span aria-hidden="true" className="gpc-test-dot" />
              {v}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
