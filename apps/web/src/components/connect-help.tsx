import Link from "next/link";
import type { IntegrationHelp } from "@/lib/integration-help";

/** Collapsed setup steps under each integration. Opens by default until connected. */
export function ConnectHelp({ help, open }: { help: IntegrationHelp; open: boolean }) {
  return (
    <details className="connect-help" open={open}>
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
