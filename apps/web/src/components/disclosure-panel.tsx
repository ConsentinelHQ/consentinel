import type { FreeReport } from "@/lib/free-report";

type Disclosure = NonNullable<FreeReport["disclosure"]>;

const plural = (n: number, w: string): string => `${String(n)} ${w}${n === 1 ? "" : "s"}`;

function host(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

/**
 * Disclosure Check: vendors that ran during the scan against the vendors the
 * site's privacy or cookie policy names. Same look as the GPC test, so the two
 * read as one set of checks.
 */
export function DisclosurePanel({ check }: { check: Disclosure }) {
  const missing = check.notNamed.length;
  const verdict =
    check.status === "no-policy"
      ? "No privacy policy found"
      : check.status === "unreadable"
        ? "Couldn’t read the policy"
        : missing === 0
          ? "Every vendor is mentioned"
          : `${plural(missing, "vendor")} not mentioned`;
  const pass = check.status === "checked" && missing === 0;

  return (
    <section aria-labelledby="disclosure-title" className="gpc-test disclosure-test">
      <div className="gpc-test-head">
        <div>
          <span className="gpc-test-kicker">
            <span aria-hidden="true" className="gpc-test-signal" />
            Disclosure check
          </span>
          <h2 className="gpc-test-title" id="disclosure-title">
            Privacy policy vs. what runs
          </h2>
        </div>
        <span className={`gpc-test-verdict${pass ? " pass" : ""}`}>{verdict}</span>
      </div>

      {check.status === "no-policy" && (
        <p className="gpc-test-lede">
          We couldn’t find a privacy policy linked from this page. California’s online privacy law
          (CalOPPA) requires sites that collect personal information from California residents to
          post one, and it’s the first place a demand letter looks for disclosure.
        </p>
      )}

      {check.status === "unreadable" && (
        <p className="gpc-test-lede">
          We found a policy but couldn’t read enough text from it, which usually means it loads
          inside a widget. Nothing here is judged, so check it by hand.
        </p>
      )}

      {check.status === "checked" && (
        <>
          <p className="gpc-test-lede">
            We read your policy and compared it with the vendors that ran during this scan. A vendor
            your policy never mentions, by its own name or its owner’s, is hard to defend as
            disclosed.
          </p>
          <div className="gpc-test-cols">
            <Column
              empty="Every vendor that ran is mentioned."
              label="Not mentioned in your policy"
              tone="bad"
              vendors={check.notNamed}
            />
            <Column
              empty="None of the vendors that ran are mentioned."
              label="Mentioned"
              tone="good"
              vendors={check.named}
            />
          </div>
        </>
      )}

      {check.policies.length > 0 && (
        <p className="gpc-test-ack disclosure-sources">
          Checked:{" "}
          {check.policies.map((p, i) => (
            <span key={p.url}>
              {i > 0 && ", "}
              <a href={p.url} rel="noopener noreferrer nofollow" target="_blank">
                {host(p.url)}
              </a>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

function Column({
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
