import type { Database } from "./client.js";
import { diffScans, findPreviousScans, type DiffItem } from "./repository.js";

/**
 * New critical findings versus the last few comparable scans. Null when there is
 * nothing comparable yet: the first scan of a detection version is a baseline.
 */
export async function newCriticalFindings(
  db: Database,
  scan: {
    id: string;
    siteId: string | null;
    url: string;
    engineVersion: string | null;
    signatureLibraryVersion: string | null;
  },
): Promise<DiffItem[] | null> {
  if (!scan.siteId) return null;
  // Compare against the last 3 scans, not just the last one. Ad-tech syncs flicker:
  // a vendor missing from one scan and back in the next is not a regression, and
  // two false alarms teach a customer to ignore the real one.
  const previous = await findPreviousScans(db, scan.siteId, scan.id, 3);
  // Only compare scans made by the same detection version. When we add signatures
  // or change fingerprints, older scans describe the same site differently, and
  // diffing across that line would alert every customer for a change on OUR side.
  const comparable = previous.filter(
    (p) =>
      p.engineVersion === scan.engineVersion &&
      p.signatureLibraryVersion === scan.signatureLibraryVersion,
  );
  if (comparable.length === 0) {
    if (previous.length > 0)
      console.log(`baseline reset for ${scan.url}: detection version changed`);
    return null;
  }
  const diff = await diffScans(
    db,
    comparable.map((p) => p.id),
    scan.id,
  );
  return diff.added.filter((f) => f.severity === "critical");
}
