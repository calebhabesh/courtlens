"use client";
import { EntityField } from "./entity-picker";

import { useState } from "react";
import { researchDestination } from "@/lib/conversation";
import { scopeContextLine } from "@/lib/scope-labels";
import { ArticleSection } from "./ui/article-layout";
import { Field } from "./ui/field";
import { Select } from "./ui/select";
import { ButtonLink } from "./ui/kit";

export function LearningWorkshop({release,season,before}:{release:string;season:string;before:string}) {
  const [player,setPlayer]=useState("1630567");
  const [window,setWindow]=useState(20);
  const href=researchDestination({step_id:"learning",operation:"distribution",arguments:{player_id:player,metric:"pts",window_n:window}}, {release_id:release,season,phase:"regular_season",before_date:before,window:"season"});
  return <ArticleSection id="workshop" title="Investigate historical scoring variation">
    <p>Compare the distribution’s observed samples, valid count and summary. Repeat with minutes to distinguish changes in workload from changes in scoring. Missing samples remain unknown. This is descriptive and does not predict appearances or injuries.</p>
    <p className="learning-scope">{scopeContextLine(season, "regular_season", before)}</p>
    <div className="learning-controls">
      <EntityField label="Lesson player" value={player} onChange={setPlayer} releaseId={release} season={season} phase="regular_season" beforeDate={before} />
      <Field label="Appearance window"><Select aria-label="Appearance window" value={window} onChange={e=>setWindow(Number(e.target.value))}>{[5,10,20].map(n=><option key={n} value={n}>Last {n}</option>)}</Select></Field>
    </div>
    {player.trim() && <div className="ui-article-actions"><ButtonLink size="sm" variant="primary" href={href}>Run this pinned distribution without AI</ButtonLink></div>}
    <p>Open exact evidence, inspect inputs and samples, then use Ask CourtLens to execute and explicitly save a selected operation.</p>
  </ArticleSection>;
}
