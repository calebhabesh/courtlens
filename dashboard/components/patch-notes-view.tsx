import { ResearchCard, ResearchCards, ResearchIntro, ResearchLinks, ResearchProse, ResearchSection } from "./research/research-page";
import { PATCH_ABOUT, PATCH_RELEASES, commitUrl, displayText, logUrl, releaseLine, shortDate, type PatchEntry } from "@/lib/patch-notes";

/*
 * Patch Notes (Research R11, catalog row 21), after Databallr's changelog: releases newest first,
 * grouped entries with a New / Updated / Removed badge, a description and an Explore link. Each
 * entry also links the commit that shipped it and, for Research blocks, the progress-log entry.
 * Build phase: shared components only.
 */

function Entry({ entry }: { entry: PatchEntry }) {
  const links = [
    ...(entry.href ? [{ label: "Explore", href: entry.href }] : []),
    { label: "Commit", ariaLabel: `Commit ${entry.commit}`, href: commitUrl(entry.commit), icon: "external" as const },
    ...(entry.log ? [{ label: "Progress log", href: logUrl(entry.log.file), icon: "external" as const }] : []),
  ];
  return <ResearchCard listItem className="patch-entry" kicker={`${entry.badge} · ${shortDate(entry.date)}`} title={entry.title}>
    <p className="rs-card-text">{displayText(entry.text)}</p>
    {entry.bullets && <ul className="rs-feature-list" data-mark="plus">{entry.bullets.map(bullet => <li key={bullet}>{displayText(bullet)}</li>)}</ul>}
    <ResearchLinks label={`${entry.title} links`} links={links} />
  </ResearchCard>;
}

export function PatchNotesView() {
  return <>
    <ResearchIntro tagline={`New pages, improvements and removals across CourtLens. ${PATCH_ABOUT}`}
      links={[{ label: "Learning", href: "/methodology/learning", icon: "book" }, { label: "Research", href: "/research", icon: "sparkles" }]} />
    {PATCH_RELEASES.map(release => <ResearchSection key={release.id} id={release.id} icon="history" title={release.title}
      aside={<span className="rs-note" data-release={release.id}>{releaseLine(release)}</span>}>
      <ResearchProse><p>{release.summary}</p></ResearchProse>
      {release.groups.map(group => <div key={group.title}>
        <p className="rs-card-kicker">{group.title}</p>
        <ResearchCards columns={2} label={`${release.title}: ${group.title}`}>
          {group.entries.map(entry => <Entry key={entry.commit + entry.title} entry={entry} />)}
        </ResearchCards>
      </div>)}
    </ResearchSection>)}
  </>;
}
