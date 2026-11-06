import type { ReactNode } from "react";
import { LearningLeagueTrends } from "./learning-league-trends";
import {
  FeatureList, FormulaLine, ResearchCallout, ResearchCard, ResearchCards, ResearchIntro, ResearchLinks,
  ResearchProse, ResearchSection
} from "./research/research-page";
import type { IconName } from "./ui/icon";
import { LEARNING_TIERS, learningTopicCount, type LearningTier, type LearningTopic } from "@/lib/learning-topics";
import { evidenceUrl } from "@/lib/research-facts";

/*
 * Learning (Research R11, catalog row 21), after Databallr's Learning page: a tier index, then each
 * tier's topics with prose, a formula, key takeaways and links. CourtLens adds a "Measured in
 * CourtLens" box quoting the Research result that tests the idea. Build phase: shared components
 * only; the Databallr styling is the design phase's.
 */

const TIER_ICONS: Record<string, IconName> = {
  "core-concepts": "book",
  "impact-measurement": "gauge",
  shooting: "target",
  "lineup-context": "users",
  "testing-models": "activity",
};

function TopicArticle({ tier, topic }: { tier: LearningTier; topic: LearningTopic }) {
  return <ResearchCard className="learning-topic" kicker={`Tier ${tier.number} — ${tier.title}`} title={<span id={topic.id}>{topic.title}</span>}>
    <p className="rs-card-text"><strong>{topic.subtitle}</strong></p>
    <ResearchProse>{topic.body.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</ResearchProse>
    {topic.panel === "league-trends" && <LearningLeagueTrends />}
    {topic.formula && <div>
      <p className="rs-card-kicker">{topic.formula.label}</p>
      {topic.formula.lines.map(line => <FormulaLine key={line}>{line}</FormulaLine>)}
    </div>}
    {topic.measured && <ResearchCallout icon="sparkles" title={`Measured in CourtLens (${topic.measured.block})`}>
      <p className="rs-card-text" data-measured={topic.id}>{topic.measured.text}</p>
      <ResearchLinks label={`${topic.title} evidence`} links={[{ label: `${topic.measured.block} evidence`, href: evidenceUrl(topic.measured.evidence), icon: "external" }]} />
    </ResearchCallout>}
    <FeatureList title="Key takeaways" icon="check" mark="plus" items={topic.takeaways} />
    <ResearchLinks label={`${topic.title} pages`} links={topic.links} />
  </ResearchCard>;
}

export function LearningView({ workshop }: { workshop?: ReactNode }) {
  const topics = learningTopicCount();
  return <>
    <ResearchIntro
      tagline={`Understand advanced NBA stats from the ground up: ${topics} topics across ${LEARNING_TIERS.length} tiers, each linked to the CourtLens page that shows it and, where CourtLens tested the idea, the measured result.`}
      links={[{ label: "Glossary", href: "/stats/glossary", icon: "book" }, { label: "Research", href: "/research", icon: "sparkles" }, { label: "Patch Notes", href: "/whats-new", icon: "history" }]}
    />
    <ResearchSection id="topics" icon="list-ordered" title="Topics">
      <ResearchCards columns={3} label="Learning tiers">
        {LEARNING_TIERS.map(tier => <ResearchCard key={tier.id} listItem kicker={`Tier ${tier.number}`} title={tier.title}>
          <p className="rs-card-text">{tier.blurb}</p>
          <ResearchLinks label={`${tier.title} topics`} links={tier.topics.map(topic => ({ label: topic.title, href: `#${topic.id}` }))} />
        </ResearchCard>)}
      </ResearchCards>
    </ResearchSection>
    {LEARNING_TIERS.map(tier => <ResearchSection key={tier.id} id={tier.id} icon={TIER_ICONS[tier.id] ?? "book"} title={`Tier ${tier.number}: ${tier.title}`}>
      <ResearchProse><p>{tier.blurb}</p></ResearchProse>
      {tier.topics.map(topic => <TopicArticle key={topic.id} tier={tier} topic={topic} />)}
    </ResearchSection>)}
    {workshop}
    <ResearchSection id="credits" icon="info" title="Credits">
      <ResearchProse>
        <p>Topic structure after Databallr&apos;s Learning page (design reference). The prose is CourtLens&apos;s own. Every measured number is the frozen result of a registered CourtLens experiment; the evidence links open its README in the public repository.</p>
      </ResearchProse>
    </ResearchSection>
  </>;
}
