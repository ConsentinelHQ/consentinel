import { OTHER_VENDORS, POPULATION, REPORT, SEGMENTS, VENDORS } from "@/lib/research";

export const dynamic = "force-static";

const q = (s: string): string => `"${s.replace(/"/g, '""')}"`;

/** The report's figures as CSV, for anyone citing them. */
export function GET(): Response {
  const lines = [
    q(`# ${REPORT.title}. Consentinel, ${REPORT.asOf}. CC BY 4.0.`),
    q(`# Population: ${POPULATION}`),
    "table,item,brands,share_percent",
    `summary,brands with trackers firing after an opt-out,${String(REPORT.sites)},100`,
    `summary,caught with Global Privacy Control,${String(REPORT.underGpc)},${String(Math.round((REPORT.underGpc / REPORT.sites) * 100))}`,
    `summary,caught after a reject click,${String(REPORT.afterReject)},${String(Math.round((REPORT.afterReject / REPORT.sites) * 100))}`,
    ...[...VENDORS, ...OTHER_VENDORS].map(
      (v) => `vendor,${q(v.name)},${String(v.sites)},${String(v.share)}`,
    ),
    ...SEGMENTS.map(
      (s) =>
        `category,${q(s.segment)},${String(s.sites)},${String(Math.round((s.sites / REPORT.sites) * 100))}`,
    ),
  ];
  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="consentinel-${REPORT.slug}.csv"`,
    },
  });
}
