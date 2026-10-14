"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HotkeysModal } from "./hotkeys-modal";
import { Button, ButtonLink, Chip, MenuTrigger } from "./ui/kit";
import { Menu, MenuItem } from "./ui/menu";
import { Modal } from "./ui/modal";
import { TeamLogo } from "./team-logo";
import { NBA_TEAMS } from "@/lib/stats-presets";

/** Databallr's help row under the page title: how-to, glossary and hotkeys. */
export function StatsHelpRow() {
  const [howToOpen, setHowToOpen] = useState(false);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  return (
    <div className="stats-help-row" role="group" aria-label="Page help">
      <Button size="lg" tone="console" icon="help" onClick={() => setHowToOpen(true)}>How to Use This Page</Button>
      <ButtonLink size="lg" tone="console" icon="page" href="/stats/glossary">Stats Glossary</ButtonLink>
      <Button size="lg" tone="console" icon="keyboard" onClick={() => setHotkeysOpen(true)}>Hotkeys</Button>
      <Modal isOpen={howToOpen} onClose={() => setHowToOpen(false)} title="How to use this page" className="stats-how-to">
        <ul className="stats-how-to-list">
          <li>Pick a season, Regular or Playoffs, and optionally a team. Through and Window narrow the dates counted.</li>
          <li>Views switch the column set. Add View saves your own; Manage reorders, edits or sets a default.</li>
          <li>Per Game, Per 36 and Totals change how counting stats are expressed.</li>
          <li>Small numbers under each value are league percentiles among qualified players; Rules above the table gives the cutoff.</li>
          <li>Hover or focus a row to preview a player. Use + to add players to a comparison.</li>
          <li>Click a column header to sort. The filter button sets minimum games and minutes.</li>
        </ul>
      </Modal>
      <HotkeysModal isOpen={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
    </div>
  );
}

/** The table listens for this to show skeleton rows while a scope filter loads. */
export const STATS_SCOPE_PENDING = "stats-scope-pending";

/** Replace scope-row URL filters; any change returns to the first page. */
function useScopeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(STATS_SCOPE_PENDING, { detail: pending }));
  }, [pending]);
  const set = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cursor");
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value); else params.delete(key);
    }
    startTransition(() => router.push(`${pathname}?${params}`));
  };
  return { searchParams, set, pending };
}

/** Databallr's "Select Team": a dialog with a grid of the 30 team logos. */
export function StatsTeamSelect() {
  const { searchParams, set } = useScopeFilter();
  const [open, setOpen] = useState(false);
  const team = searchParams.get("teamId") || searchParams.get("team_id") || "";
  const selected = NBA_TEAMS.find(entry => entry.tricode === team);
  const choose = (tricode: string | null) => { setOpen(false); set({ teamId: tricode, team_id: null }); };
  return (
    <>
      <Button size="lg" tone="console" data-selected={selected ? "true" : undefined} onClick={() => setOpen(true)}
        aria-haspopup="dialog" aria-label={selected ? `Team: ${selected.name}. Change team` : "Select Team"}>
        {selected ? <><TeamLogo team={selected.tricode} size={20} />{selected.tricode}</> : "Select Team"}
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Select Team" description="30 NBA teams" className="stats-team-dialog">
        <div className="stats-team-grid" role="group" aria-label="NBA teams">
          {NBA_TEAMS.map(entry => (
            <button key={entry.tricode} type="button" className="stats-team-option" aria-pressed={entry.tricode === team}
              aria-label={entry.name} onClick={() => choose(entry.tricode)}>
              <TeamLogo team={entry.tricode} size={40} />
              <span>{entry.tricode}</span>
            </button>
          ))}
        </div>
        {selected && <button type="button" className="stats-team-clear" onClick={() => choose(null)}>Show all teams</button>}
      </Modal>
    </>
  );
}

const POSITIONS = [
  { value: "PG", label: "Point guards" }, { value: "SG", label: "Shooting guards" },
  { value: "SF", label: "Small forwards" }, { value: "PF", label: "Power forwards" }, { value: "C", label: "Centers" }
] as const;

/**
 * Databallr's PG · SG · SF · PF · C chips. Positions are CourtLens estimates for the shown season
 * (position-estimates-v1): the free NBA index lists only G, F and C.
 */
export function StatsPositionChips() {
  const { searchParams, set } = useScopeFilter();
  const current = searchParams.get("positions") ?? "";
  // Pressed state follows the click at once; the URL catches up when the table lands.
  const [optimistic, setOptimistic] = useState<{ from: string; value: string } | null>(null);
  const shown = optimistic && optimistic.from === current ? optimistic.value : current;
  const active = new Set(shown.split(",").filter(Boolean));
  const toggle = (value: string) => {
    const next = new Set(active);
    if (next.has(value)) next.delete(value); else next.add(value);
    const joined = POSITIONS.map(p => p.value).filter(p => next.has(p)).join(",");
    setOptimistic({ from: current, value: joined });
    set({ positions: joined || null });
  };
  return (
    <div className="stats-position-chips" role="group" aria-label="Estimated positions"
      title="Estimated positions for this season from listed position, size and box-score rates (not a roster listing).">
      {POSITIONS.map(position => (
        <Chip key={position.value} size="lg" tone="console" pressed={active.has(position.value)}
          aria-label={position.label} onClick={() => toggle(position.value)}>{position.value}</Chip>
      ))}
    </div>
  );
}

/** Databallr's Draft Class menu: one NBA draft year at a time. */
export function StatsDraftClassSelect({ classes }: { classes: { year: number; players: number }[] }) {
  const { searchParams, set } = useScopeFilter();
  const year = Number(searchParams.get("draftYear") || 0) || null;
  if (classes.length === 0) return null;
  return (
    <Menu className="stats-draft-menu"
      renderTrigger={props => <MenuTrigger {...props} size="lg" tone="console" icon="graduation" selected={Boolean(year)}>{year ? `${year} Draft` : "Draft Class"}</MenuTrigger>}>
      {year && <MenuItem label="All draft classes" icon="close" onClick={() => set({ draftYear: null })} />}
      {classes.map(entry => (
        <MenuItem key={entry.year} label={String(entry.year)} className={entry.year === year ? "is-active" : ""}
          onClick={() => set({ draftYear: String(entry.year) })} />
      ))}
    </Menu>
  );
}
