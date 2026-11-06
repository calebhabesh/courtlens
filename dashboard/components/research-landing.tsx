import { MethodSteps, ResearchCard, ResearchCards, ResearchLinks, ResearchProse, ResearchSection } from "./research/research-page";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { NAV_MENUS } from "@/lib/nav-model";
import { RESEARCH_FACTS, evidenceUrl, fact } from "@/lib/research-facts";
import { HEADLINE_CARDS } from "@/lib/research-landing";

/*
 * Research landing (R12, D8: "/research opens the menu"): one card per headline result, then how the
 * results were tested and every Research page from the menu. Build phase: shared components only.
 */

export function ResearchLanding() {
  const research = NAV_MENUS.find(menu => menu.id === "research");
  const groups = (research?.groups ?? []).filter(group => group.items.some(item => item.href !== "/research"));
  return <PageShell template="research">
    <PageHeader icon="sparkles" title="Research" subtitle="CourtLens's own models and tests, each scored on seasons it never saw." />
    <ResearchSection id="headline-results" icon="trophy" title="Headline Results">
      <ResearchCards columns={3} label="Headline results">
        {HEADLINE_CARDS.map(card => <ResearchCard key={card.id} listItem className="research-headline" kicker={`${card.block} · ${card.title}`}
          title={card.headline
            ? <span data-fact={card.headline.fact} data-value={RESEARCH_FACTS[card.headline.fact].value}>{fact(card.headline.fact)}{card.headline.suffix ?? ""}</span>
            : <span data-status="in-progress">Evaluation in progress</span>}>
          <p className="rs-card-text">{card.sentence}</p>
          <p className="rs-note" data-tested={card.id}>{card.tested}</p>
          <ResearchLinks label={`${card.title} links`} links={[
            { label: card.title, href: card.page },
            ...(card.evidence ? [{ label: `${card.block} evidence`, href: evidenceUrl(card.evidence), icon: "external" as const }] : []),
          ]} />
        </ResearchCard>)}
      </ResearchCards>
    </ResearchSection>
    <ResearchSection id="how-tested" icon="list-ordered" title="How These Were Tested">
      <MethodSteps steps={[
        { title: "Register first", text: "Each model's candidates, test seasons and pass rules are committed before any fit." },
        { title: "Choose on earlier seasons", text: "Candidates are compared only on seasons before the test seasons." },
        { title: "Read the test once", text: "The test seasons are scored once and the result is published, including when it is negative." },
        { title: "Score what happens next", text: "Win Probability and Projected Impact were frozen during 2026-27 and are scored only on games played after their freeze." },
      ]} />
    </ResearchSection>
    <ResearchSection id="pages" icon="cards" title="All Research Pages">
      <ResearchCards columns={3} label="Research pages">
        {groups.map(group => <ResearchCard key={group.title ?? "group"} listItem kicker={group.title}>
          <ResearchLinks label={`${group.title ?? "Research"} pages`} links={group.items.filter(item => item.href !== "/research").map(item => ({ label: item.label, href: item.href, icon: item.icon }))} />
        </ResearchCard>)}
      </ResearchCards>
      <ResearchProse><p>Learning explains the ideas behind these pages; Patch Notes lists when each one shipped.</p></ResearchProse>
    </ResearchSection>
  </PageShell>;
}
