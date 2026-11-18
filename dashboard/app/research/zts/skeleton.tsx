import { SkelLines, SkelResearchSection, SkelText } from "@/components/ui/content-skeletons";

/** zTS: the left-aligned registered-metric hero, the opening copy, then its first section. */
export default function Loading() {
  return <div className="ui-page ui-page-research zt-shell" role="status" aria-busy="true" aria-label="Loading zTS"><div className="rs-column zt-page">
    <header className="ui-page-header zt-hero" aria-hidden="true">
      <SkelText size="xs" width={300} />
      <SkelText size="3xl" width="86%" /><SkelText size="3xl" width="58%" />
      <SkelLines lines={2} size="lg" last="40%" />
    </header>
    <SkelLines lines={6} size="sm" last="50%" />
    <SkelResearchSection answer={0} prose={4} figure="bars" rows={6} />
  </div></div>;
}
