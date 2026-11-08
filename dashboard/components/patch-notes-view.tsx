import { ResearchDisclosure, ResearchIntro } from "./research/research-page";
import { ButtonLink } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { PATCH_ABOUT, PATCH_RELEASES, commitUrl, displayText, isUnmerged, logUrl, monthRange, patchEntries, releaseLine, shortDate, type PatchEntry, type PatchRelease } from "@/lib/patch-notes";

/*
 * Patch Notes (Research R11, catalog row 21; RD07 design, owner 2026-11-08), after Databallr's changelog: the centred hero, then
 * releases newest first in an article column. Each release has a 160 px column (month, version, name, the merge line) that stays
 * in view while its entries are read, beside plain entry rows: title with its badge, Explore, the sentence, dot bullets and one
 * quiet line with the date, the commit and the progress-log entry.
 */

function Entry({ entry }: { entry: PatchEntry }) {
  return <li className="pn-entry" data-entry={entry.commit}>
    <div className="pn-entry-head">
      <h4 className="pn-entry-title">{entry.title}{" "}<span className="pn-badge" data-badge={entry.badge.toLowerCase()}>{entry.badge}</span></h4>
      {/* Round 2 (owner): condensed; the date, commit and log share the title row with Explore. */}
      <div className="pn-entry-side">
        <p className="pn-entry-meta">
          <time dateTime={entry.date}>{shortDate(entry.date)}</time>
          <span aria-hidden="true">·</span>
          <a href={commitUrl(entry.commit)} aria-label={`Commit ${entry.commit}`}><span className="pn-hash">{entry.commit}</span></a>
          {entry.log && <><span aria-hidden="true">·</span><a href={logUrl(entry.log.file)}>Progress log</a></>}
        </p>
        {entry.href && <ButtonLink className="pn-explore" size="sm" variant="text" href={entry.href} iconAfter="arrow-right" aria-label={`Explore ${entry.title}`}>Explore</ButtonLink>}
      </div>
    </div>
    <p className="pn-entry-text">{displayText(entry.text)}</p>
    {entry.bullets && <ul className="pn-bullets">{entry.bullets.map(bullet => <li key={bullet}>{displayText(bullet)}</li>)}</ul>}
  </li>;
}

/** Round 2: the version and the date on their own lines in the tile (the text still reads "PR #42 · merged Nov 3, 2026"). */
function ReleaseLine({ release }: { release: PatchRelease }) {
  const [where, ...when] = releaseLine(release).split(" · ");
  return <><span className="pn-release-part">{where}</span><span className="pn-release-sep"> · </span><span className="pn-release-part">{when.join(" · ")}</span></>;
}

function Release({ release }: { release: PatchRelease }) {
  const headingId = `${release.id}-heading`;
  return <li id={release.id} className="pn-release" aria-labelledby={headingId}>
    <div className="pn-release-head">
      <p className="pn-month">{monthRange(release.range)}</p>
      <h2 id={headingId} className="pn-version">
        <span className="pn-number">{release.number}</span>{" "}
        {isUnmerged(release) && <><span className="pn-badge" data-badge="unmerged">Unmerged</span>{" "}</>}
        <span className="pn-release-name">{release.title}</span>
      </h2>
      <p className="pn-release-line" data-release={release.id}>
        {release.merge ? <a href={commitUrl(release.merge.commit)}><ReleaseLine release={release} /></a> : <ReleaseLine release={release} />}
      </p>
    </div>
    <div className="pn-release-body">
      <p className="pn-summary">{release.summary}</p>
      {release.groups.map(group => <section key={group.title} className="pn-group" aria-label={`${release.number} ${group.title}`}>
        <h3 className="pn-group-title">{group.title}</h3>
        <ul className="pn-entries">{group.entries.map(entry => <Entry key={entry.commit + entry.title} entry={entry} />)}</ul>
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
        links={[{ label: "Learning", href: "/methodology/learning", icon: "book" }, { label: "Research", href: "/research", icon: "sparkles" }]}
      />
      <ol className="pn-releases" aria-label="Releases, newest first">
        {PATCH_RELEASES.map(release => <Release key={release.id} release={release} />)}
      </ol>
      <ResearchDisclosure id="about" icon="info" title="About this page">
        <div className="pn-about">
          <p>{PATCH_ABOUT}</p>
          <p>Entries are written from the git history and the progress logs. A check script matches every commit, date and progress-log heading against the repository, and the version numbers against the merge order.</p>
          <p>Layout after Databallr&apos;s changelog, the design reference. The wording and the releases are CourtLens&apos;s own.</p>
        </div>
      </ResearchDisclosure>
    </div>
  </PageShell>;
}
