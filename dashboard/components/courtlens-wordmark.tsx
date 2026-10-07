import { WORDMARK_HEIGHT, WORDMARK_PATH, WORDMARK_WIDTH } from "@/lib/courtlens-wordmark";

/** Fixed wordmark artwork keeps Fontshare Red Hat Display consistent in pages and standalone exports. */
export function CourtLensWordmark({ height = 14, x, y, color = "currentColor" }: {
  height?: number; x?: number; y?: number; color?: string;
}) {
  return <svg x={x} y={y} width={height * WORDMARK_WIDTH / WORDMARK_HEIGHT} height={height}
    viewBox={`0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}`} role="img" aria-label="CourtLens"
    className="courtlens-wordmark" focusable="false">
    <title>CourtLens</title><path d={WORDMARK_PATH} fill={color} />
  </svg>;
}
