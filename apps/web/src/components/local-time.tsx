"use client";

import { useEffect, useState } from "react";

/** Formats in the viewer's timezone. Server renders UTC, so swap after mount. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(
      new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
  }, [iso]);
  return <time dateTime={iso}>{text ?? "\u00a0"}</time>;
}
