"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { LearningLeagueTrends } from "./learning-league-trends";
import { ResearchDisclosure, ResearchIntro, ResearchLinks } from "./research/research-page";
import { GridSearch } from "./research/stats-grid";
import { Icon } from "./ui/icon";
import { Button, ButtonLink, ButtonSummary } from "./ui/kit";
import { PageShell } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { LEARNING_TIERS, learningTopic, learningTopicCount, topicMatches, type LearningTier, type LearningTopic } from "@/lib/learning-topics";
import { evidenceUrl } from "@/lib/research-facts";

/*
 * Learning (Research R11, catalog row 21; RD06 design, owner 2026-11-08), after Databallr's Learning page: the centred hero, a
 * topic search, a sticky numbered index beside the topic cards (a collapsed index above them on a phone), each card with its
 * tier pill, prose, labelled formula wells, a Myth / Reality well where a CourtLens result answers the myth, the Measured in
 * CourtLens well, Key Takeaways, prerequisite chips and links. The prose and numbers are CourtLens's own.
 */

const tierVar = (tier: LearningTier) => ({ "--ln-tier": `var(--color-category-${TIER_HUES[tier.number - 1] ?? 6})` }) as CSSProperties;
/** Fixed categorical order (Design Language: labelled categories, no rank): blue, teal, gold, violet, pink. */
const TIER_HUES = [2, 4, 1, 3, 5];

function TopicIndex({ tiers, current, onPick }: { tiers: readonly { tier: LearningTier; topics: readonly LearningTopic[] }[]; current: string | null; onPick?: () => void }) {
  return <ol className="ln-index-tiers">
    {tiers.map(({ tier, topics }) => <li key={tier.id} className="ln-index-tier">
      <a className="ln-index-tier-link" href={`#${tier.id}`} onClick={onPick}>{tier.number}. {tier.title}</a>
      <ol className="ln-index-topics" aria-label={`${tier.title} topics`}>
        {topics.map(topic => <li key={topic.id}>
          <a className="ln-index-link" href={`#${topic.id}`} aria-current={current === topic.id ? "location" : undefined} onClick={onPick}>{topic.title}</a>
        </li>)}
      </ol>
    </li>)}
  </ol>;
}

function TopicCard({ tier, topic }: { tier: LearningTier; topic: LearningTopic }) {
  return <article id={topic.id} className="ln-topic" data-topic={topic.id} aria-labelledby={`${topic.id}-title`} style={tierVar(tier)}>
    <span className="ln-pill">Tier {tier.number} · {tier.title}</span>
    <div className="ln-topic-head">
      <h3 id={`${topic.id}-title`} className="ln-topic-title">{topic.title}</h3>
      <p className="ln-topic-sub">{topic.subtitle}</p>
    </div>
    <div className="ln-prose">{topic.body.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>
    {topic.panel === "league-trends" && <LearningLeagueTrends />}
    {topic.formulas && <div className="ln-formulas">
      {topic.formulas.map(formula => <div key={formula.label} className="ln-well ln-formula">
        <p className="ln-well-label">{formula.label}</p>
        <code className="ln-formula-line">{formula.line}</code>
      </div>)}
    </div>}
    {topic.myth && topic.measured && <div className="ln-myth" data-myth={topic.id}>
      <p className="ln-myth-label"><Icon name="alert" size={14} />Myth</p>
      <p className="ln-myth-text">{topic.myth}</p>
      <p className="ln-myth-label ln-myth-label-reality"><Icon name="sparkles" size={14} />Reality, measured in CourtLens<span className="ln-block">{topic.measured.block}</span></p>
      <p className="ln-myth-reality" data-measured={topic.id}>{topic.measured.text}</p>
      <ResearchLinks label={`${topic.title} evidence`} links={[{ label: `${topic.measured.block} evidence`, href: evidenceUrl(topic.measured.evidence), icon: "external" }]} />
    </div>}
    {topic.measured && !topic.myth && <div className="ln-well ln-measured">
      <p className="ln-measured-head"><Icon name="sparkles" size={14} />Measured in CourtLens<span className="ln-block">{topic.measured.block}</span></p>
      <p className="ln-measured-text" data-measured={topic.id}>{topic.measured.text}</p>
      <ResearchLinks label={`${topic.title} evidence`} links={[{ label: `${topic.measured.block} evidence`, href: evidenceUrl(topic.measured.evidence), icon: "external" }]} />
    </div>}
    <div className="ln-takeaways">
      <p className="ln-kicker">Key takeaways</p>
      <ul className="ln-takeaway-list">{topic.takeaways.map(item => <li key={item}>{item}</li>)}</ul>
    </div>
    {topic.prerequisites && topic.prerequisites.length > 0 && <div className="ln-prereqs">
      <p className="ln-prereqs-label">Read first</p>
      <nav className="ln-prereq-list" aria-label={`${topic.title} prerequisites`}>
        {topic.prerequisites.map(id => {
          const found = learningTopic(id);
          return found ? <ButtonLink key={id} size="xs" variant="secondary" href={`#${id}`}>{found.topic.title}</ButtonLink> : null;
        })}
      </nav>
    </div>}
    <div className="ln-links">
      <ResearchLinks label={`${topic.title} pages`} links={topic.links.map(link => ({ ...link, icon: "arrow-right" as const }))} />
    </div>
  </article>;
}

export function LearningView() {
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const total = learningTopicCount();
  const tiers = useMemo(() => LEARNING_TIERS.map(tier => ({ tier, topics: tier.topics.filter(topic => topicMatches(topic, query)) })).filter(entry => entry.topics.length > 0), [query]);
  const shown = tiers.reduce((sum, entry) => sum + entry.topics.length, 0);

  // The current topic: the last card whose top has passed the upper third of the window (cards read fresh on each update).
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const cards = document.querySelectorAll<HTMLElement>("[data-topic]");
      const line = window.innerHeight / 3;
      let found: string | null = cards[0]?.dataset.topic ?? null;
      for (const card of cards) if (card.getBoundingClientRect().top <= line) found = card.dataset.topic ?? found;
      setCurrent(found);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); window.removeEventListener("hashchange", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [tiers]);

  return <PageShell template="research" className="ln-shell">
    <div className="rs-column ln-page">
      <PageHeader className="sq-hero ln-hero research-hero" icon="book" title="Learning" subtitle="Understand advanced NBA stats from the ground up." />
      <ResearchIntro
        tagline={`${total} topics across ${LEARNING_TIERS.length} tiers, from per-possession thinking to testing models, each linked to the CourtLens page that shows it.`}
        links={[{ label: "Definitions", href: "/methodology", icon: "table" }, { label: "Glossary", href: "/stats/glossary", icon: "book" }, { label: "Research", href: "/research", icon: "sparkles" }, { label: "Patch Notes", href: "/whats-new", icon: "history" }]}
      />
      <div className="ln-body">
        <div className="ln-search"><GridSearch value={query} onChange={setQuery} label="Search topics" placeholder="Search topics…" /></div>
        <div className="ln-layout">
          <aside className="ln-aside">
            <nav className="ln-index" aria-label="Learning topics"><TopicIndex tiers={tiers} current={current} /></nav>
          </aside>
          <details className="ln-index-phone" open={indexOpen} onToggle={event => setIndexOpen(event.currentTarget.open)}>
            <ButtonSummary size="md" variant="secondary" icon="list-ordered" iconAfter="chevron-down">Topics ({shown})</ButtonSummary>
            <nav className="ln-index" aria-label="Learning topics (phone)"><TopicIndex tiers={tiers} current={current} onPick={() => setIndexOpen(false)} /></nav>
          </details>
          <div className="ln-topics">
            {query.trim() && <p className="ln-count" role="status">{shown} of {total} topics match &ldquo;{query.trim()}&rdquo;</p>}
            {shown === 0 && <div className="ln-empty">
              <p>No topic mentions &ldquo;{query.trim()}&rdquo;.</p>
              <Button size="sm" variant="secondary" icon="close" onClick={() => setQuery("")}>Clear search</Button>
            </div>}
            {tiers.map(({ tier, topics }) => <section key={tier.id} id={tier.id} className="ln-tier" aria-labelledby={`${tier.id}-heading`} style={tierVar(tier)}>
              <div className="ln-tier-head">
                <h2 id={`${tier.id}-heading`} className="ln-tier-title">Tier {tier.number}: {tier.title}</h2>
                <p className="ln-tier-blurb">{tier.blurb}</p>
              </div>
              {topics.map(topic => <TopicCard key={topic.id} tier={tier} topic={topic} />)}
            </section>)}
          </div>
        </div>
      </div>
      <ResearchDisclosure id="about" icon="info" title="About this page">
        <div className="ln-prose">
          <p>Topic layout after Databallr&apos;s Learning page, the design reference. The prose is CourtLens&apos;s own, and so is every number.</p>
          <p>Each Measured in CourtLens figure, including the Reality under a myth, is the frozen result of a registered CourtLens experiment; a test checks every one against the committed results, and the evidence links open its README in the public repository. Formulas are definitions in symbols, with no made-up examples.</p>
          <p>The league trends come from CourtLens&apos;s own count of every regular-season play-by-play game, which starts in 2014-15. The Teams data holds box-score league averages for older seasons, but it defines turnover and rebound rates differently, so the two are not joined into one line.</p>
        </div>
      </ResearchDisclosure>
    </div>
  </PageShell>;
}
