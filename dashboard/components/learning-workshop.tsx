"use client";
import { EntityField } from "./entity-picker";

import Link from "next/link";
import { useState } from "react";
import { researchDestination } from "@/lib/conversation";
export function LearningWorkshop({release,season,before}:{release:string;season:string;before:string}) {
  const [player,setPlayer]=useState("1630567");
  const [window,setWindow]=useState(20);
  const href=researchDestination({step_id:"learning",operation:"distribution",arguments:{player_id:player,metric:"pts",window_n:window}}, {release_id:release,season,phase:"regular_season",before_date:before,window:"season"});
  return <section className="panel"><h2>Investigate historical scoring variation</h2><p>Compare the distribution’s observed samples, valid count and summary. Repeat with minutes to distinguish changes in workload from changes in scoring. Missing samples remain unknown. This is descriptive and does not predict appearances or injuries.</p><p className="conversation-context">Release {release} · {season} · regular season · before {before} (exclusive)</p><div className="conversation-controls"><EntityField label="Lesson player" value={player} onChange={setPlayer} releaseId={release} season={season} phase="regular_season" beforeDate={before} /><label>Appearance window<select value={window} onChange={e=>setWindow(Number(e.target.value))}>{[5,10,20].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>{player.trim() && <Link className="button" href={href}>Run this pinned distribution without AI</Link>}<p>Open exact evidence, inspect inputs and samples, then use Ask CourtLens to execute and explicitly save a selected operation.</p></section>;
}
