/**
 * Infinite text marquee. Pure CSS: the list is rendered twice and the track
 * slides by exactly half its width, so the loop has no seam.
 */
export function Marquee({
  items,
  label,
  reverse = false,
}: {
  items: readonly string[];
  label: string;
  reverse?: boolean;
}) {
  return (
    <div className="marquee" data-reverse={reverse ? "" : undefined}>
      <p className="marquee-label">{label}</p>
      <div aria-label={`${label}: ${items.join(", ")}`} className="marquee-viewport" role="img">
        <ul aria-hidden="true" className="marquee-track">
          {[...items, ...items].map((item, i) => (
            <li key={`${item}-${String(i)}`}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
