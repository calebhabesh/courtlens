import type { ReactNode } from "react";
import { teamCode, type LiveTeam } from "@/lib/live";
import { Icon, type IconName } from "./ui/icon";

export function logoTeam(team: LiveTeam) { return team.tricode ?? team.canonical_id ?? teamCode(team); }

/** A game-view panel: an icon and title, an optional action, then its body. */
export function Panel({ title, icon, children, className = "", action }: { title: string; icon?: IconName; children: ReactNode; className?: string; action?: ReactNode }) {
  return <section className={`live-panel ${className}`} aria-label={title}>
    <header className="live-panel-head"><h2>{icon && <Icon name={icon} size={20} />}{title}</h2>{action}</header>
    {children}
  </section>;
}
