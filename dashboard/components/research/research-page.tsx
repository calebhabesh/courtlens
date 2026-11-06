"use client";

import { useId, type ReactNode } from "react";
import { Icon, type IconName } from "../ui/icon";
import { ButtonLink, Segmented, type SegmentedOption } from "../ui/kit";
import { intervalLabel, intervalTone, signed, toneReason } from "@/lib/research-values";

/*
 * Shared building blocks for Research pages in the design phase (alignment row 18 set the pattern,
 * after Databallr's explainer pages). Pages compose these; page CSS only places them.
 */

/** Centred tagline and text links under the centred page header (`TabbedPage` hero). */
export function ResearchIntro({ tagline, links }: { tagline: ReactNode; links?: { label: string; href: string; icon?: IconName }[] }) {
  return <div className="rs-intro">
    <p className="rs-intro-tagline">{tagline}</p>
    {links && links.length > 0 && <nav className="rs-intro-links" aria-label="Related pages">
      {links.map(link => <ButtonLink key={link.href} size="sm" variant="text" href={link.href} icon={link.icon}>{link.label}</ButtonLink>)}
    </nav>}
  </div>;
}

/** A page section on the page background: 24 px heading with its icon, a rule between sections. */
export function ResearchSection({ id, icon, title, aside, children, className = "" }: { id?: string; icon: IconName; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  const headingId = useId();
  return <section id={id} className={`rs-section ${className}`} aria-labelledby={headingId}>
    <div className="rs-section-head">
      <h2 id={headingId} className="rs-heading"><Icon name={icon} size={20} />{title}</h2>
      {aside && <div className="rs-section-aside">{aside}</div>}
    </div>
    {children}
  </section>;
}

/** Explanatory paragraph; long copy stays at a readable measure. */
export function ResearchProse({ children }: { children: ReactNode }) {
  return <div className="rs-prose">{children}</div>;
}

/** Equal cards in a row: 3 at desktop, 2 at tablet, 1 on a phone (or 2 → 1). */
export function ResearchCards({ columns = 3, children, label }: { columns?: 2 | 3; children: ReactNode; label?: string }) {
  return <div className="rs-cards" data-columns={columns} role={label ? "list" : undefined} aria-label={label}>{children}</div>;
}

/** A card. `tone` tints it with an identity colour (a gold, b blue) that carries no good/bad meaning. */
export function ResearchCard({ title, kicker, aside, tone, children, className = "", listItem = false }: {
  title?: ReactNode; kicker?: ReactNode; aside?: ReactNode; tone?: "a" | "b"; children?: ReactNode; className?: string; listItem?: boolean;
}) {
  return <article className={`rs-card ${className}`} data-tone={tone} role={listItem ? "listitem" : undefined}>
    {(kicker || aside) && <div className="rs-card-top">{kicker && <p className="rs-card-kicker">{kicker}</p>}{aside}</div>}
    {title && <h3 className="rs-card-title">{title}</h3>}
    {children}
  </article>;
}

/** A formula or rule in monospace on an inset well. */
export function FormulaLine({ children }: { children: ReactNode }) {
  return <p className="rs-formula">{children}</p>;
}

/**
 * A signed estimate, green or red only when its interval excludes zero. Exact values sit on the
 * element (`data-value`, `data-low`, `data-high`) for checks against the API.
 */
export function SignalValue({ value, low, high, digits = 2, className = "" }: { value: number | null | undefined; low?: number | null; high?: number | null; digits?: number; className?: string }) {
  const tone = value == null ? undefined : intervalTone(low, high);
  return <span className={`rs-value ${className}`} data-tone={tone} data-value={value ?? undefined} data-low={low ?? undefined} data-high={high ?? undefined}
    title={value == null ? undefined : `${intervalLabel(low, high, digits)} · ${toneReason(tone)}`}>{signed(value, digits)}</span>;
}

/** Full-width tabs over a framed panel (Databallr's factor tabs). */
export function ResearchTabPanel<T extends string>({ label, options, value, onChange, children }: { label: string; options: readonly SegmentedOption<T>[]; value: T; onChange: (value: T) => void; children: ReactNode }) {
  return <div className="rs-tabpanel">
    <Segmented size="lg" stretch label={label} options={options} value={value} onChange={onChange} />
    <div className="rs-tabpanel-body">{children}</div>
  </div>;
}

/** "What shows up" (+) or "What it misses" (?) list on an inset card. */
export function FeatureList({ title, icon, mark, items }: { title: string; icon: IconName; mark: "plus" | "question"; items: readonly string[] }) {
  return <div className="rs-feature">
    <h4 className="rs-feature-title" data-mark={mark}><Icon name={icon} size={16} />{title}</h4>
    <ul className="rs-feature-list" data-mark={mark}>{items.map(item => <li key={item}>{item}</li>)}</ul>
  </div>;
}

/** A short ranked list: value, identity, interval. The order follows estimates, not verdicts. */
export function RankedList({ title, label, items }: { title: string; label: string; items: { key: string; identity: ReactNode; value: number | null; low: number | null; high: number | null }[] }) {
  return <div className="rs-ranked">
    <h4 className="rs-ranked-title">{title}</h4>
    <ol className="rs-ranked-list" aria-label={label}>
      {items.map(item => <li key={item.key}>
        <SignalValue value={item.value} low={item.low} high={item.high} />
        <span className="rs-ranked-identity">{item.identity}</span>
        <span className="rs-interval">{intervalLabel(item.low, item.high)}</span>
      </li>)}
    </ol>
  </div>;
}

/** An inset callout with an icon heading (Databallr's Cross-Factor Tradeoffs box). */
export function ResearchCallout({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return <div className="rs-callout"><h4 className="rs-callout-title"><Icon name={icon} size={16} />{title}</h4>{children}</div>;
}

/**
 * A collapsed section (Databallr's Caveats & Methodology). The body stays in the DOM while closed
 * (D14), so its caveat wording is always present.
 */
export function ResearchDisclosure({ id, icon, title, children, open = false }: { id?: string; icon: IconName; title: string; children: ReactNode; open?: boolean }) {
  return <section id={id} className="rs-section rs-disclosure" aria-label={title}>
    <details open={open || undefined}>
      <summary className="rs-disclosure-summary"><h2 className="rs-heading"><Icon name={icon} size={20} />{title}</h2><Icon name="chevron-down" size={20} className="rs-disclosure-chevron" /></summary>
      <div className="rs-disclosure-body">{children}</div>
    </details>
  </section>;
}

/** How to read the numbers: units, the colour key and one example per side. */
export function ReadingGuide({ units, offense, defense, note }: { units: ReactNode; offense: ReactNode; defense: ReactNode; note?: ReactNode }) {
  return <div className="rs-reading">
    <p className="rs-prose-line">{units}</p>
    <ToneLegend />
    <ResearchCards columns={2}>
      <ResearchCard kicker="Offense example" tone="a"><p className="rs-card-text">{offense}</p></ResearchCard>
      <ResearchCard kicker="Defense example" tone="b"><p className="rs-card-text">{defense}</p></ResearchCard>
    </ResearchCards>
    {note && <p className="rs-note">{note}</p>}
  </div>;
}

/** The colour key every Research value uses. */
export function ToneLegend({ className = "" }: { className?: string }) {
  return <ul className={`rs-legend ${className}`} aria-label="Colour key">
    <li><span className="rs-swatch" data-tone="good" aria-hidden="true" />Helps: 80% interval above zero</li>
    <li><span className="rs-swatch" data-tone="bad" aria-hidden="true" />Hurts: 80% interval below zero</li>
    <li><span className="rs-swatch" aria-hidden="true" />Interval includes zero, or unknown</li>
  </ul>;
}

export interface GlossaryGroup { label: string; icon: IconName; tone?: "a" | "b"; items: readonly { term: string; text: ReactNode }[] }

/** Column glossary as cards, grouped (Databallr's Column Glossary). */
export function Glossary({ groups }: { groups: readonly GlossaryGroup[] }) {
  return <div className="rs-glossary">
    {groups.map(group => <div key={group.label} className="rs-glossary-group">
      <h3 className="rs-glossary-label" data-tone={group.tone}><Icon name={group.icon} size={14} />{group.label}</h3>
      <dl className="rs-glossary-items">
        {group.items.map(item => <div key={item.term} className="rs-glossary-item" data-tone={group.tone}><dt>{item.term}</dt><dd>{item.text}</dd></div>)}
      </dl>
    </div>)}
  </div>;
}

/** Numbered method steps on inset cards (Databallr's "Four Parallel Regressions"). */
export function MethodSteps({ steps }: { steps: readonly { title: string; text: ReactNode }[] }) {
  return <ol className="rs-steps">{steps.map(step => <li key={step.title}><h4>{step.title}</h4><p>{step.text}</p></li>)}</ol>;
}

/** A titled inset block inside a disclosure. */
export function MethodBlock({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rs-method-block"><h3 className="rs-method-title">{title}</h3>{children}</div>;
}
