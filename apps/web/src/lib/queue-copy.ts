/** "You're #14, about 6 minutes." Pure, tested. */
export function waitCopy(position?: number, etaSeconds?: number): string {
  const mins = etaSeconds ? Math.max(1, Math.round(etaSeconds / 60)) : 0;
  const eta = mins > 0 ? `about ${String(mins)} minute${mins === 1 ? "" : "s"}` : "";
  if (position && position > 1) {
    return eta
      ? `You're #${String(position)} in line, ${eta}.`
      : `You're #${String(position)} in line.`;
  }
  return eta ? `Ready in ${eta}.` : "";
}
