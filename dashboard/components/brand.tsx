import { IntentLink } from "./intent-link";
import { BrandMark } from "./brand-mark";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { SpinningBrandMark } from "./spinning-brand-mark";

export { BrandMark };

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <IntentLink className="brand" href="/stats" aria-label="CourtLens Research Workbench home">
      <SpinningBrandMark />
      <div className="brand-text">
        <span className="brand-title"><CourtLensWordmark /></span>
        {subtitle && <span className="brand-subtitle">{subtitle}</span>}
      </div>
    </IntentLink>
  );
}

/** The official lockup, ball-lens logo beside the wordmark: the label on every branded, screenshottable card. Same 2:1 logo-to-wordmark scale as the header (28px mark, 14px wordmark). */
export function CourtLensLockup({ height = 16 }: { height?: number }) {
  return <span className="brand-lockup"><BrandMark size={height * 2} framed={false} /><CourtLensWordmark height={height} /></span>;
}

/** "CourtLens" as the mark and the wordmark, where a sentence names CourtLens ("CourtLens favors …"). */
export function CourtLensSays({ size = 13 }: { size?: number }) {
  return <span className="brand-says"><BrandMark size={size + 5} framed={false} /><CourtLensWordmark height={size} /></span>;
}
