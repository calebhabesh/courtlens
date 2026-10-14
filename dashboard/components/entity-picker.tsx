"use client";

import { useEffect, useRef, useState } from "react";
import type { LookupItem } from "@/lib/types";
import { queryLookup } from "@/lib/workbench-api";
import { buildLookupCacheKey, defaultLookupCache } from "@/lib/lookup-cache";
import { LookupIdentity, LookupInput, useLookupScope, type LookupScope } from "./lookup-input";
import { IconButton } from "./ui/kit";

export interface EntityPickerProps extends LookupScope {
  label: string;
  kind?: "player" | "team";
  selected: LookupItem[];
  onChange: (items: LookupItem[]) => void;
  multiple?: boolean;
  max?: number;
  excludedIds?: string[];
  candidates?: LookupItem[];
  required?: boolean;
  disabled?: boolean;
}
export function EntityPicker({label, kind = "player", selected, onChange, multiple = false, max = 5, excludedIds = [], candidates, required, disabled, ...scope}: EntityPickerProps) {
  const [text,setText] = useState("");
  const selectionKey = selected.map(item=>item.canonical_id).join(",");
  const [previousSelection,setPreviousSelection] = useState(selectionKey);
  if(selectionKey !== previousSelection) {setPreviousSelection(selectionKey);if(selected.length) setText("");}
  const full = multiple && selected.length >= max;
  return <div className="entity-picker" role="group" aria-label={label}>
    <span className="entity-label">{label}</span>
    {selected.length > 0 && <ul className="entity-chips" aria-label={`Selected ${label}`}>{selected.map(item=><li key={item.canonical_id} className="entity-chip"><LookupIdentity item={item} committed /><IconButton size="lg" variant="ghost" icon="close" disabled={disabled} label={`Remove ${item.display_name} from ${label}`} onClick={()=>{setText("");onChange(selected.filter(value=>value.canonical_id !== item.canonical_id));}} /></li>)}</ul>}
    <LookupInput {...scope} candidates={candidates} label={label} value={text} kinds={[kind]} excludedIds={[...excludedIds,...selected.map(item=>item.canonical_id)]} required={required && selected.length === 0} disabled={disabled || full} placeholder={full ? `Maximum ${max} selected` : `Search ${kind}s by name`} onChange={value=>{setText(value); if(!multiple && selected.length) onChange([]);}} onSelect={item=>{setText("");onChange(multiple ? [...selected,item] : [item]);}} />
    {required && selected.length === 0 && text && <span className="form-hint">Choose a suggestion to confirm this {kind}.</span>}
    {/* Typed text is never a committed selection or a valid form value. */}
    <input aria-hidden="true" className="entity-validity" aria-label={`${label} selection`} tabIndex={-1} value={selected.length ? "selected" : ""} onChange={()=>{}} required={required} onInvalid={event=>{event.preventDefault();event.currentTarget.parentElement?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus();}} />
  </div>;
}

/** Canonical-ID adapter for existing URL/API state; IDs are resolved, never editable text. */
export function EntityField({value, onChange, initialName, ...props}: Omit<EntityPickerProps,"selected" | "onChange"> & {value: string; onChange: (value: string, items: LookupItem[]) => void; initialName?: string}) {
  const resolved = useLookupScope(props);
  const kind = props.kind ?? "player";
  const ids = [...new Set(value.split(/[\s,]+/).filter(Boolean))];
  const key = JSON.stringify([ids,kind,resolved,props.candidates]);
  const known = useRef(new Map<string,LookupItem>());
  const [state,setState] = useState<{key:string; items:LookupItem[]; error?: string} | null>(null);
  const [retry,setRetry] = useState(0);
  useEffect(()=>{
    const abort = new AbortController();
    const pending = ids.map(async id=>{
      const knownKey = JSON.stringify([id,kind,resolved]);
      if(props.candidates) { const local = props.candidates.find(item=>item.canonical_id === id); if(!local) throw new Error("Selection is outside the available roster or watchlist."); return local; }
      const item = known.current.get(knownKey);
      if(item) return item;
      const options = {query:id,...resolved,kinds:[kind],limit:1};
      const cacheKey = buildLookupCacheKey(options);
      const response = defaultLookupCache.get(cacheKey) ?? await queryLookup({...options,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(5000)])});
      if(abort.signal.aborted) return undefined;
      defaultLookupCache.set(cacheKey,response);
      const match = response.items.find(item=>item.canonical_id === id || (kind === "team" && item.portrait_fallback === id));
      if(!match) throw new Error("The selected entity is not in this release's lookup catalog.");
      if(known.current.size >= 64) known.current.clear();
      known.current.set(knownKey,match); return match;
    });
    Promise.all(pending).then(items=>{if(!abort.signal.aborted) setState({key,items:items.filter((item): item is LookupItem=>!!item)});}).catch(error=>{if(!abort.signal.aborted) setState({key,items:[],error:error instanceof Error ? error.message : "Selection lookup unavailable."});});
    return ()=>abort.abort();
    // key contains serialized IDs, kind and complete scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,retry]);
  const selected = state?.key === key ? state.items : [];
  return <div><EntityPicker {...props} selected={selected} onChange={items=>{if(known.current.size >= 64) known.current.clear();for(const item of items) known.current.set(JSON.stringify([item.canonical_id,kind,resolved]),item);onChange(items.map(item=>item.canonical_id).join(","),items);}} />
    {ids.length > 0 && state?.key !== key && <p role="status">Resolving {initialName ?? `selected ${kind}`}…</p>}
    {state?.key === key && state.error && <p role="alert">{state.error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Retry selection</button> <button type="button" onClick={()=>onChange("",[])}>Clear selection</button></p>}
  </div>;
}
