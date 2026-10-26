import { verifyPolicyText, type PolicyVersionRow } from "@consentinel/db";
import { diffPolicy } from "@consentinel/shared";
import { longDay } from "@/lib/demand";

/** One saved version: its dates, hash check, what changed, and the full text. */
export function PolicyVersionItem({
  v,
  previous,
  current,
}: {
  v: PolicyVersionRow;
  previous: PolicyVersionRow | undefined;
  current: boolean;
}) {
  const ok = verifyPolicyText(v);
  const diff = previous ? diffPolicy(previous.text, v.text) : null;
  return (
    <li className="policy-version">
      <div className="policy-version-head">
        <strong>
          {longDay(v.firstSeenAt)}
          {current ? " to now" : ` to ${longDay(v.lastSeenAt)}`}
        </strong>
        {current && <span className="policy-badge">Current</span>}
        <span className={`policy-seal ${ok ? "ok" : "bad"}`}>
          {ok ? "Text matches its hash" : "Text does not match its hash"}
        </span>
      </div>
      <p className="quiet policy-meta">
        <a href={v.url} rel="noopener noreferrer nofollow" target="_blank">
          {v.url}
        </a>{" "}
        · {v.chars.toLocaleString("en-US")} characters
        <span className="mono proof">sha256 {v.sha256}</span>
      </p>
      {diff && (diff.added.length > 0 || diff.removed.length > 0) && (
        <div className="policy-diff">
          {diff.added.length > 0 && (
            <div>
              <h3>Added</h3>
              <ul className="added">
                {diff.added.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {diff.removed.length > 0 && (
            <div>
              <h3>Removed</h3>
              <ul className="removed">
                {diff.removed.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {diff && diff.added.length === 0 && diff.removed.length === 0 && (
        <p className="quiet">Only formatting changed from the version before.</p>
      )}
      {!previous && <p className="quiet">First version on record.</p>}
      <details className="policy-text">
        <summary>Full text</summary>
        <div className="policy-body">{v.text}</div>
      </details>
    </li>
  );
}
