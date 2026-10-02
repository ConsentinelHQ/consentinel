import { CopyButton } from "@/components/copy-button";

/** Setup steps for letting the scanner past Cloudflare bot protection. */
export function AllowlistPanel({ token, open }: { token: string; open: boolean }) {
  const expression = `(http.request.headers["x-consentinel-token"][0] eq "${token}")`;
  return (
    <details className="allowlist" open={open}>
      <summary>Scans blocked? Allow Consentinel through Cloudflare</summary>
      <p className="quiet">
        If your site uses Cloudflare bot protection, add one rule so scans get through. Takes about
        two minutes. Only requests carrying this site&apos;s private token are allowed.
      </p>
      <ol>
        <li>
          Cloudflare dashboard &gt; your domain &gt;{" "}
          <strong>Security &gt; WAF &gt; Custom rules</strong> (newer dashboards: Security &gt;
          Security rules) &gt; <strong>Create rule</strong>.
        </li>
        <li>
          Name it <code>Allow Consentinel</code>, click <strong>Edit expression</strong>, and paste:
          <div className="allowlist-code">
            <pre>{expression}</pre>
            <CopyButton text={expression} />
          </div>
        </li>
        <li>
          Action: <strong>Skip</strong>. Tick all remaining custom rules, rate limiting rules,
          managed rules, and Super Bot Fight Mode.
        </li>
        <li>
          Place it <strong>first</strong>, deploy, then click Scan now.
        </li>
      </ol>
      <p className="quiet">
        On Cloudflare&apos;s free plan, Bot Fight Mode can&apos;t be skipped by rules. Turn it off
        under Security &gt; Bots, or upgrade to Pro. Keep the token private - it only works for this
        site.
      </p>
    </details>
  );
}
