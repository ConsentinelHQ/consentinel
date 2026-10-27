/**
 * Horizontal bars for one measure across items. One series, so one color and
 * no legend; each bar carries its value as text, so nothing is color-only.
 */
export function BarList({
  rows,
  max,
  label,
}: {
  rows: { name: string; value: number; display: string; href?: string; title: string }[];
  max: number;
  label: string;
}) {
  return (
    <ul aria-label={label} className="bar-list">
      {rows.map((r) => (
        <li key={r.name} title={r.title}>
          <span className="bar-name">{r.href ? <a href={r.href}>{r.name}</a> : r.name}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${String((r.value / max) * 100)}%` }} />
          </span>
          <span className="bar-value">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}
