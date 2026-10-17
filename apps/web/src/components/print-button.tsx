"use client";

/** Browser print to PDF. Print styles strip nav and controls so the PDF is just the report. */
export function PrintButton({ label = "Download PDF" }: { label?: string }) {
  return (
    <button className="print-button" onClick={() => window.print()} type="button">
      <svg
        aria-hidden
        fill="none"
        height="15"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width="15"
      >
        <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
      </svg>
      {label}
    </button>
  );
}
