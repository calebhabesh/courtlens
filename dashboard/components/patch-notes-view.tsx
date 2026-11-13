import { ResearchDisclosure, ResearchIntro } from "./research/research-page";
import { ButtonLink } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { PATCH_ABOUT, PATCH_RELEASES, dateRange, monthRange, patchEntries, shortDate, type PatchEntry, type PatchRelease } from "@/lib/patch-notes";

/*
 * Patch Notes (Research R11, catalog row 21; RD07 design, owner 2026-11-08), after Databallr's changelog: the centred hero, then
 * releases newest first in an article column. Each release has a 160 px gold-tinted column (month, version, name, dates) that
 * stays in view while its entries are read, beside plain entry rows: title with its badge, Explore and one sentence. Round 4
 * (owner): a simple list for site visitors, so no commits, progress logs or branch and merge details are shown; the JSON keeps
 * them for the check script.
 */

function Entry({ entry }: { entry: PatchEntry }) {
  return <li className="pn-entry">
    <div className="pn-entry-head">
      <h4 className="pn-entry-title">{entry.title}{" "}<span className="pn-badge" data-badge={entry.badge.toLowerCase()}>{entry.badge}</span></h4>
      {entry.href && <ButtonLink className="pn-explore" size="sm" variant="text" href={entry.href} iconAfter="arrow-right" aria-label={`Explore ${entry.title}`}>Explore</ButtonLink>}
    </div>
    <p className="pn-entry-text">{entry.text}</p>
  </li>;
}

function Release({ release }: { release: PatchRelease }) {
  const headingId = `${release.id}-heading`;
  return <li id={release.id} className="pn-release" aria-labelledby={headingId}>
    <div className="pn-release-head">
      <p className="pn-month">{monthRange(release.range)}</p>
      <h2 id={headingId} className="pn-version">
        <span className="pn-number">{release.number}</span>{" "}
        <span className="pn-release-name">{release.title}</span>
      </h2>
      <p className="pn-release-line" data-release={release.id}>{dateRange(release.range)}</p>
    </div>
    <div className="pn-release-body">
      <p className="pn-summary">{release.summary}</p>
      {release.groups.map(group => <section key={group.title} className="pn-group" aria-label={`${release.number} ${group.title}`}>
        <h3 className="pn-group-title">{group.title}</h3>
        <ul className="pn-entries">{group.entries.map(entry => <Entry key={entry.title} entry={entry} />)}</ul>
      </section>)}
    </div>
  </li>;
}

export function PatchNotesView() {
  const entries = patchEntries();
  const latest = entries.reduce((newest, entry) => entry.date > newest ? entry.date : newest, "");
  return <PageShell template="article" className="pn-shell">
    <div className="rs-column pn-page">
      <PageHeader className="sq-hero pn-hero research-hero" icon="history" title="Patch Notes" subtitle="New pages, improvements and removals across CourtLens." />
      <ResearchIntro
        tagline={<>Latest <time dateTime={latest}>{shortDate(latest)}</time> · {PATCH_RELEASES.length} releases · {entries.length} changes</>}
        links={[{ label: "Learning", href: "/methodology/learning", icon: "book" }]}
      />
      <ol className="pn-releases" aria-label="Releases, newest first">
        {PATCH_RELEASES.map(release => <Release key={release.id} release={release} />)}
      </ol>
      <ResearchDisclosure id="about" icon="info" title="About this page">
        <div className="pn-about">
          <p>{PATCH_ABOUT}</p>
          <p>Layout after Databallr&apos;s changelog, the design reference. The wording and the releases are CourtLens&apos; own.</p>
        </div>
      </ResearchDisclosure>
    </div>
  </PageShell>;
}
