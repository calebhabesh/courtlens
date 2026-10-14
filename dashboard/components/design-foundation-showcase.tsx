"use client";

import { useState } from "react";
import {
  CountChip,
  DataDetailsButton,
  DatePicker,
  Field,
  FilterBar,
  GatedNote,
  Input,
  PageHeader,
  Panel,
  PlayerIdentity,
  Select,
  StatTile,
  Switch,
  TeamIdentity,
  TemplateSkeleton,
  type PageTemplate,
} from "@/components/ui";
import { TeamGrid } from "@/components/team-grid";
import { ArticleLayout, ArticleSection } from "@/components/ui/article-layout";
import { useAdvancedMode } from "@/lib/advanced-mode";
import { formatDate, parseIsoDate } from "@/lib/format-date";
import { Button, Chip, Segmented } from "@/components/ui/kit";

const FOCUS = [
  { value: "overall", label: "Overall Impact" },
  { value: "scoring", label: "Scoring & Shooting" },
  { value: "playmaking", label: "Playmaking" },
  { value: "defense", label: "Defense" }
];
const TEMPLATES: { value: PageTemplate; label: string }[] = [
  { value: "explorer", label: "Explorer" },
  { value: "profile", label: "Profile" },
  { value: "compare", label: "Compare" },
  { value: "board", label: "Board" },
  { value: "research", label: "Research" },
  { value: "article", label: "Article" }
];

/** /design catalogue of the FO01 shared foundation primitives. */
export function DesignFoundationShowcase() {
  const [season, setSeason] = useState("2025-26");
  const [through, setThrough] = useState("2026-04-12");
  const [gameDay, setGameDay] = useState("2026-04-10");
  const [phase, setPhase] = useState("regular_season");
  const [positions, setPositions] = useState<string[]>(["G"]);
  const [focus, setFocus] = useState("overall");
  const [template, setTemplate] = useState<PageTemplate>("board");
  const [basis, setBasis] = useState("observed");
  const [team, setTeam] = useState("1610612738");
  const [advanced, setAdvanced] = useAdvancedMode();
  const weekday = (value: string) => parseIsoDate(value)?.getUTCDay();

  return (
    <div className="ui-design-foundation">
      <Panel title="PageHeader (D7)" compact>
        <PageHeader
          title="Player Showcase"
          subtitle="Shareable stat cards for any player in the current scope."
          actions={<><Button variant="secondary" size="xs" icon="search">Find player</Button><Button variant="primary" size="xs" icon="download">Export</Button></>}
        />
      </Panel>

      <Panel title="FilterBar (D6) · modes (v1.1) · Field · DatePicker · Chip · Data details" compact>
        <FilterBar
          label="Example filter bar"
          summary={`${season} · Regular Season · ${formatDate(through, "compact")}`}
          scope={<>
            <Field label="Season" layout="inline">
              <Select value={season} onChange={(event) => setSeason(event.target.value)} aria-label="Example season">
                <option value="2025-26">2025-26</option>
                <option value="2024-25">2024-25</option>
              </Select>
            </Field>
            <Field label="Phase" layout="inline">
              <Select value={phase} onChange={(event) => setPhase(event.target.value)} aria-label="Example phase">
                <option value="regular_season">Regular Season</option>
                <option value="playoffs">Playoffs</option>
              </Select>
            </Field>
            <Field label="Through" layout="inline">
              <DatePicker label="Example through date" value={through} onChange={setThrough} min="2025-10-21" max="2026-04-12" />
            </Field>
          </>}
          filters={<div className="ui-design-cluster" role="group" aria-label="Example positions">
            {[{ value: "G", label: "Guards" }, { value: "F", label: "Forwards" }, { value: "C", label: "Centers" }].map(option => (
              <Chip key={option.value} size="lg" pressed={positions.includes(option.value)}
                onClick={() => setPositions(current => current.includes(option.value) ? current.filter(value => value !== option.value) : [...current, option.value])}>{option.label}</Chip>
            ))}
          </div>}
          modes={<Segmented size="lg" label="Example basis" value={basis} onChange={setBasis}
            options={[{ value: "observed", label: "Observed" }, { value: "projected", label: "Projected" }]} />}
          count={<CountChip>591 players</CountChip>}
          details={<DataDetailsButton scope={{ releaseId: "5bbb6035-6794-4bb0-b894-7208f52ef7ad", season, phase, beforeDate: "2026-04-13", window: "season" }}
            rows={[{ label: "Source", value: "sportsdataverse" }]} />}
        />
      </Panel>

      <div className="ui-design-foundation-grid">
        <Panel title="Field (stacked) and icon inputs" compact>
          <Field label="Team" hint="Icon inputs reserve space; text never runs under the icon.">
            <Input prefixIcon="search" placeholder="Search teams by name" aria-label="Example team search" />
          </Field>
        </Panel>

        <Panel title="DatePicker with unavailable dates" compact>
          <Field label="Game day" hint="Weekends are disabled here to show dates with no games.">
            <DatePicker label="Example game day" value={gameDay} onChange={setGameDay}
              isDateDisabled={(value) => weekday(value) === 0 || weekday(value) === 6} />
          </Field>
        </Panel>

        <Panel title="Segmented (stretch and plain)" compact>
          <Segmented size="md" label="Example focus" stretch options={FOCUS} value={focus} onChange={setFocus} />
          <Segmented size="md" label="Example window" value="season" onChange={() => {}}
            options={[{ value: "season", label: "Season" }, { value: "last_10", label: "Last 10" }, { value: "last_5", label: "Last 5" }]} />
        </Panel>

        <Panel title="GatedNote with Why? (D4/D14)" compact>
          <GatedNote
            action={<Button size="xs" variant="secondary">Jump to Apr 12</Button>}
            why={<p>The retained release has no finalized games dated Oct 8, 2026. Missing games are unknown, not zero.</p>}
          >
            No games on Oct 8.
          </GatedNote>
        </Panel>
      </div>

      <Panel title="Identity (D10): headshot, team logo, team-color accent" compact>
        <div className="ui-design-identity-row">
          <PlayerIdentity playerId="1629029" name="Luka Dončić" team="LAL" subtitle="Guard" size="xl" />
          <PlayerIdentity playerId="1628983" name="Shai Gilgeous-Alexander" team="OKC" size="lg" />
          <PlayerIdentity playerId="1630162" name="Anthony Edwards" team="MIN" size="md" />
          <PlayerIdentity name="Missing Photo" team="BOS" size="md" subtitle="Initials on team color" />
          <TeamIdentity team="NYK" size="lg" subtitle="53-29 · Atlantic" />
        </div>
      </Panel>

      <Panel title="StatTile (D16)" compact>
        <div className="ui-design-tiles">
          <StatTile label="Points" value="33.5" unit="PPG" percentile={100} rank={1} rankOf={591} />
          <StatTile label="Assists" value="8.7" unit="APG" percentile={96} rank={9} rankOf={591} />
          <StatTile label="True shooting" value="61.2%" percentile={78} rank={64} rankOf={591} />
          <StatTile label="Defensive rating" value={null} footnote="Unknown in this release" />
        </div>
      </Panel>

      <Panel title="Template skeletons (D11/D22)" compact>
        <Segmented size="md" label="Skeleton template" options={TEMPLATES} value={template} onChange={setTemplate} />
        <div className="ui-design-skeleton-frame"><TemplateSkeleton template={template} /></div>
      </Panel>

      <Panel title="Article template (FO13)" compact>
        <div className="ui-design-article-frame">
          <ArticleLayout toc={[{ id: "design-article-scope", label: "Scope" }, { id: "design-article-facts", label: "Facts" }]}>
            <ArticleSection id="design-article-scope" title="Scope">
              <p>One readable column of about 720px beside a table of contents. Methodology, What&apos;s New and Settings use it.</p>
            </ArticleSection>
            <ArticleSection id="design-article-facts" title="Facts">
              <dl className="ui-article-facts">
                <div><dt>Column</dt><dd>720px</dd></div>
                <div><dt>Contents</dt><dd>Sticky beside the column; one row below 1024px</dd></div>
              </dl>
            </ArticleSection>
          </ArticleLayout>
        </div>
      </Panel>

      <Panel title="Logo-grid picker (v1.1 Board pattern, gate 2)" compact>
        <TeamGrid selected={team} onSelect={setTeam} />
      </Panel>

      <Panel title="Advanced mode (D5)" compact>
        <Switch checked={advanced} onChange={setAdvanced} label={`Advanced mode is ${advanced ? "on" : "off"} (shared with Settings)`} id="design-advanced-mode" />
      </Panel>
    </div>
  );
}
