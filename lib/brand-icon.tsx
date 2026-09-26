import { ImageResponse } from "next/og";

/** The Tracklet mark as a PNG at any size. `maskable` adds the safe-zone padding Android expects. */
export function brandIcon(size: number, { maskable = false } = {}) {
  const inset = maskable ? size * 0.1 : 0;
  const inner = size - inset * 2;

  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: maskable ? "#f97316" : "transparent" }}>
        <div style={{ width: inner, height: inner, borderRadius: maskable ? 0 : inner * 0.28, background: "#f97316", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={inner * 0.72} height={inner * 0.72} viewBox="0 0 32 32">
            <path d="M5 10.5 12 17.5 16.5 13 26 22.5" fill="none" stroke="white" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M26 15.5v7h-7" fill="none" stroke="white" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
