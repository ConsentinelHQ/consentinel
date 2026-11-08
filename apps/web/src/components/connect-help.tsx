import Link from "next/link";
import type { IntegrationHelp } from "@/lib/integration-help";

/** Setup steps under each integration, collapsed until someone needs them. */
export function ConnectHelp({ help }: { help: IntegrationHelp }) {
  return (
    <details className="connect-help">
      <summary>How to connect {help.name}</summary>
      <ol>
        {help.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="quiet">
        Stuck? <Link href={`/help/${help.slug}`}>Full guide and common fixes</Link>
      </p>
    </details>
  );
}
