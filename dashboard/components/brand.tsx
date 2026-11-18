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

/** "CourtLens" as the mark and the wordmark, where a sentence names CourtLens ("CourtLens favors …"). */
export function CourtLensSays({ size = 13 }: { size?: number }) {
  return <span className="brand-says"><BrandMark size={size + 5} framed={false} /><CourtLensWordmark height={size} /></span>;
}
