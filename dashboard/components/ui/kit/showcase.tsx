"use client";

import { useState } from "react";
import { Menu, MenuItem, Popover } from "../menu";
import { Panel, Section } from "../panel";
import { Button, ButtonLink, ButtonSummary, IconButton } from "./button";
import { Chip, RemovableChip } from "./chip";
import { MenuTrigger } from "./menu-trigger";
import { Select, type SelectSize } from "./select";
import { Segmented } from "./segmented";
import type { KitSize, KitVariant } from "./recipes";

const sizes: readonly KitSize[] = ["xs", "sm", "md", "lg"];
const variants: readonly KitVariant[] = ["primary", "secondary", "ghost", "danger"];
const states = ["Rest", "Hover", "Press", "Focus", "Selected", "Disabled", "Loading"] as const;
const selectSizes: readonly SelectSize[] = ["sm", "md", "lg"];
const tones = ["default", "console"] as const;
const row = "kit:flex kit:flex-wrap kit:items-center kit:gap-2";
const stack = "kit:flex kit:flex-col kit:gap-4 kit:min-w-0";

export function ControlKitShowcase() {
  const [choice, setChoice] = useState("table");
  const [chip, setChip] = useState(false);
  const [removed, setRemoved] = useState(false);
  return (
    <Section title="8. Control kit v1 (UC02)" description="Every size, variant and state. Hover, hold Press, or Tab to Focus to inspect the live interaction. Existing pages adopt the kit in UC04.">
      <div data-control-kit-showcase className={stack}>
        <Panel title="Buttons and icon buttons">
          <div className={stack}>
            {sizes.flatMap(size => variants.map(variant => (
              <div key={`${size}-${variant}`} data-demo-size={size} data-demo-variant={variant} className={stack}>
                <h3 className="kit:text-sm">{size} · {variant}</h3>
                <div className={row}>
                  {states.map(state => <Button key={state} size={size} variant={variant} icon="plus" pressed={state === "Selected"} disabled={state === "Disabled"} loading={state === "Loading"} data-demo-state={state}>{state}</Button>)}
                </div>
                <div className={row}>
                  {states.map(state => <IconButton key={state} size={size} variant={variant} icon="star" label={`${size} ${variant} ${state}`} pressed={state === "Selected"} disabled={state === "Disabled"} loading={state === "Loading"} />)}
                </div>
              </div>
            )))}
          </div>
        </Panel>
        <Panel title="Links, disclosures and tones">
          <div className={stack}>
            {sizes.map(size => <div key={size} className={row}>
              <ButtonLink size={size} href="/design#control-kit" current icon="external">{size} current link</ButtonLink>
              <details><ButtonSummary size={size} iconAfter="chevron-down">{size} disclosure</ButtonSummary><p>Native disclosure content.</p></details>
              <Button size={size} tone="console">Console</Button>
              <Button size={size} variant="ghost" tone="onBackground">On background</Button>
            </div>)}
          </div>
        </Panel>
        <Panel title="Native selects">
          <div className={stack}>
            {selectSizes.flatMap(size => tones.map(tone => <div key={`${size}-${tone}`} className={row}>
              {["rest", "invalid", "disabled"].map(state => <Select key={state} size={size} tone={tone} aria-label={`${size} ${tone} ${state} select`} invalid={state === "invalid"} disabled={state === "disabled"} defaultValue="regular"><option value="regular">{size} {tone} · Regular</option><option value="playoffs">Playoffs</option></Select>)}
            </div>))}
          </div>
        </Panel>
        <Panel title="Menu and popover triggers">
          <div className={stack}>
            {sizes.flatMap(size => (["secondary", "ghost"] as const).map(variant => <div key={`${size}-${variant}`} className={row}>
              <Menu renderTrigger={props => <MenuTrigger {...props} size={size} variant={variant}>{size} {variant} menu</MenuTrigger>}><MenuItem label="Choose table" onClick={() => setChoice("table")} /><MenuItem label="Choose cards" onClick={() => setChoice("cards")} /></Menu>
              <Popover renderTrigger={props => <MenuTrigger {...props} size={size} variant={variant} selected icon="calendar">Selected popover</MenuTrigger>}><p>Popover content</p></Popover>
              <MenuTrigger size={size} variant={variant} disabled>Disabled</MenuTrigger>
              <MenuTrigger size={size} variant={variant} expanded>Expanded state</MenuTrigger>
            </div>))}
            <div className={row}>{sizes.map(size => <MenuTrigger key={size} size={size} tone="console" selected icon="users">{size} console choice</MenuTrigger>)}</div>
          </div>
        </Panel>
        <Panel title="Segmented groups">
          <div className={stack}>
            {sizes.flatMap(size => tones.map(tone => <div key={`${size}-${tone}`} className={row}>
              <Segmented size={size} tone={tone} label={`${size} ${tone} view`} value={choice} onChange={setChoice} deferChange options={[{ value: "table", label: `${size} Table`, icon: "table" }, { value: "cards", label: "Cards", icon: "cards" }, { value: "disabled", label: "Disabled", disabled: true }]} />
              <Segmented size={size} tone={tone} label={`${size} ${tone} disabled group`} value="table" onChange={() => {}} disabled options={[{ value: "table", label: "Table" }, { value: "cards", label: "Cards" }]} />
            </div>))}
          </div>
        </Panel>
        <Panel title="Toggle and removable chips">
          <div className={stack}>
            {sizes.flatMap(size => tones.map(tone => <div key={`${size}-${tone}`} className={row}>
              <Chip size={size} tone={tone} icon="filter" pressed={chip} onClick={() => setChip(value => !value)}>{size} {tone} toggle</Chip>
              <Chip size={size} tone={tone} pressed>Selected</Chip>
              <Chip size={size} tone={tone} disabled>Disabled</Chip>
              {!removed && <RemovableChip size={size} tone={tone} icon="users" removeLabel={`Remove ${size} ${tone} team`} onRemove={() => setRemoved(true)}>Boston Celtics</RemovableChip>}
            </div>))}
            {removed && <Button onClick={() => setRemoved(false)}>Restore removable chips</Button>}
          </div>
        </Panel>
      </div>
    </Section>
  );
}
