"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import type { LookupItem } from "@/lib/types";
import { buildLookupCacheKey, defaultLookupCache } from "@/lib/lookup-cache";
import { queryLookup } from "@/lib/workbench-api";
import { Icon } from "./ui/icon";
import { Button, IconButton } from "./ui/kit";
import { PlayerPortrait } from "./player-portrait";
import { TeamLogo, TeamLogoStack } from "./team-logo";

export interface LookupScope {
  releaseId?: string | null;
  season?: string | null;
  phase?: string | null;
  beforeDate?: string | null;
}
type FloatingLookupStyle = CSSProperties & {
  "--lookup-left": string;
  "--lookup-top": string;
  "--lookup-width": string;
  "--lookup-max-height": string;
};
export function useLookupScope(scope: LookupScope) {
  const params = useSearchParams();
  return {
    releaseId: scope.releaseId !== undefined ? scope.releaseId : params.get("releaseId") ?? params.get("release_id"),
    season: scope.season !== undefined ? scope.season : params.get("season"),
    phase: scope.phase !== undefined ? scope.phase : params.get("phase"),
    beforeDate: scope.beforeDate !== undefined ? scope.beforeDate : params.get("beforeDate") ?? params.get("before_date")
  };
}

function compactCaption(item: LookupItem) {
  if (item.kind !== "player") return item.subtitle;
  if (item.availability?.status === "no_current_games") return "No stats in selected scope";
  const association = item.team_association;
  if (!association?.teams.length) return undefined;
  return `${association.teams.join(" / ")}${association.basis === "last_observed" ? " · Last observed team" : association.season ? ` · ${association.season}` : " · Selected scope"}`;
}

export function LookupIdentity({ item, committed = false, compact = false }: { item: LookupItem; committed?: boolean; compact?: boolean }) {
  return <><span className="lookup-item-leading">{item.kind === "player" ? <><PlayerPortrait playerId={item.metadata?.identity_namespace === "planner" ? undefined : item.canonical_id} name={item.display_name} portraitUrl={item.portrait_url} size="sm" /><TeamLogoStack teams={item.team_association?.teams ?? []} label={item.team_association?.basis === "last_observed" ? "Last observed team" : "Teams observed in selected scope"} /></> : item.kind === "team" ? <TeamLogo team={item.portrait_fallback ?? item.canonical_id} size={32} /> : <Icon name="search" />}</span><span className="lookup-item-content"><span className="lookup-item-name">{item.display_name}</span>{!committed && !compact && item.matched_alias && <span className="lookup-alias-badge">aka {item.matched_alias}</span>}<span className="lookup-item-subtitle">{compact ? compactCaption(item) : <>{item.subtitle}{item.kind === "player" && item.availability?.status === "no_current_games" ? item.team_association?.season ? " · No appearances in selected season" : " · No observed appearances" : ""}</>}</span></span></>;
}

export interface LookupInputProps extends LookupScope {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: LookupItem) => void;
  onSubmitText?: (value: string) => void;
  kinds?: Array<"player" | "team" | "page">;
  excludedIds?: string[];
  candidates?: LookupItem[];
  limit?: number;
  debounceMs?: number;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  required?: boolean;
  disabled?: boolean;
  compactResults?: boolean;
  portalDropdown?: boolean;
  clearLabel?: string;
  onClear?: () => void;
}

/** Form-safe lookup. Enter only commits an explicitly highlighted candidate. */
export function LookupInput({ label, value, onChange, onSelect, onSubmitText, kinds, candidates, excludedIds = [], limit = 10, debounceMs = 120, placeholder = "Search by name", inputRef, autoFocus, required, disabled, compactResults = false, portalDropdown = false, clearLabel, onClear, ...scope }: LookupInputProps) {
  const resolved = useLookupScope(scope);
  const key = buildLookupCacheKey({ query: value, ...resolved, kinds, limit }) + JSON.stringify(candidates ?? null);
  const id = useId();
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{left: number; top: number; width: number; maxHeight: number} | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const composing = useRef(false);
  const [open, setOpen] = useState(false);
  const [ime, setIme] = useState(false);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{key: string; items: LookupItem[]; error?: string} | null>(null);
  const [active, setActive] = useState(-1);
  const items = useMemo(() => (state?.key === key && !state.error ? state.items : []).filter(item => !excludedIds.includes(item.canonical_id)).sort((a,b) => ["player","team","page"].indexOf(a.kind) - ["player","team","page"].indexOf(b.kind)), [state, key, excludedIds]);
  const loading = open && !ime && state?.key !== key;
  const error = state?.key === key ? state.error : undefined;
  function invalidate() { sequence.current++; controller.current?.abort(); setActive(-1); }
  function change(text: string) { invalidate(); onChange(text); setOpen(true); }
  function close() { invalidate(); setOpen(false); }
  function choose(item: LookupItem) { onSelect(item); ref.current?.focus(); close(); }
  useEffect(() => {
    const token = ++sequence.current;
    controller.current?.abort();
    if (!open || ime || disabled) return;
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(async () => {
      try {
        if(candidates) {
          const normalize = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase();
          const query = normalize(value.trim());
          const items = candidates.filter(item=>normalize(item.display_name).includes(query) || normalize(item.subtitle ?? "").includes(query)).slice(0,limit);
          if(token === sequence.current && !abort.signal.aborted) setState({key,items});
          return;
        }
        const cached = defaultLookupCache.get(key);
        const response = cached ?? await queryLookup({query: value.trim(), ...resolved, kinds, limit, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)])});
        if (token !== sequence.current || abort.signal.aborted) return;
        if (!cached) defaultLookupCache.set(key, response);
        setState({key, items: response.items});
      } catch {
        if (token === sequence.current && !abort.signal.aborted) setState({key, items: [], error: "Search is unavailable. Your text is preserved. Retry or check the backend connection."});
      }
    }, debounceMs);
    return () => { clearTimeout(timer); abort.abort(); };
    // key contains all scope/kind/limit/query values; stable scalar dependencies avoid request loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, open, ime, disabled, retry, debounceMs]);
  useEffect(() => { if (open && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block:"nearest"}); }, [active, id, open]);
  const currentActive = open && !loading && !error && active >= 0 && active < items.length ? active : -1;
  useEffect(() => {
    if (!portalDropdown || !open) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Anchor to the whole field (icon included), so results drop straight from the search box.
        const box = (ref.current?.closest(".lookup-input-wrapper") ?? ref.current)?.getBoundingClientRect();
        if (!box) return;
        const width = Math.min(Math.max(box.width, 320), window.innerWidth - 16);
        const below = window.innerHeight - box.bottom - 12;
        const above = box.top - 12;
        const useAbove = below < 180 && above > below;
        const maxHeight = Math.min(420, Math.max(80, useAbove ? above : below));
        const height = Math.min(dropdownRef.current?.scrollHeight ?? maxHeight, maxHeight);
        setPosition({ left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)), width,
          top: useAbove ? Math.max(8, box.top - height - 4) : box.bottom + 4, maxHeight });
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [portalDropdown, open, ref, key, loading, items.length, error]);
  const blur: React.FocusEventHandler<HTMLDivElement> = event => {
    if (!rootRef.current?.contains(event.relatedTarget) && !dropdownRef.current?.contains(event.relatedTarget)) close();
  };
  const floatingStyle: FloatingLookupStyle | undefined = portalDropdown && position ? {
    "--lookup-left": `${position.left}px`,
    "--lookup-top": `${position.top}px`,
    "--lookup-width": `${position.width}px`,
    "--lookup-max-height": `${position.maxHeight}px`,
  } : undefined;
  // Before typing, show the dropdown only when there are real suggestions (pages, teams).
  const idleEmpty = !value.trim() && !error && !items.length;
  const dropdown = open && !disabled && !idleEmpty && <div ref={dropdownRef} onBlur={blur}
    className={`lookup-dropdown ${compactResults ? "lookup-compact-results" : ""} ${portalDropdown ? "lookup-floating-dropdown" : ""}`}
    style={floatingStyle}>
      {loading && <p className="lookup-status-message">Searching…</p>}
      {error && <div className="lookup-status-message error">{error}<Button size="xs" onClick={() => {invalidate(); setState(null); setRetry(n=>n+1); ref.current?.focus();}}>Retry search</Button></div>}
      {!loading && !ime && !error && !items.length && <p className="lookup-status-message">{`No matches for “${value}”. Try a shorter name or another spelling.`}</p>}
      <ul id={`${id}-list`} role="listbox" aria-label={`${label} suggestions`} className="lookup-listbox">
        {items.map((item,index) => <Fragment key={`${item.kind}:${item.canonical_id}`}>{(index === 0 || items[index-1].kind !== item.kind) && <li role="presentation" className="lookup-group-header">{item.kind === "player" ? "Players" : item.kind === "team" ? "Teams" : "Pages and tools"}</li>}<li id={`${id}-option-${index}`} role="option" tabIndex={-1} aria-selected={index === currentActive} className={`lookup-option ${index === currentActive ? "selected" : ""}`} onPointerDown={event=>{if(event.pointerType === "mouse") event.preventDefault();}} onClick={()=>choose(item)} onMouseEnter={()=>setActive(index)}><LookupIdentity item={item} compact={compactResults} /></li></Fragment>)}
      </ul>
    </div>;
  return <div ref={rootRef} className="lookup-combobox" onBlur={blur}>
    <div className="lookup-input-wrapper">
      <Icon name="search" className="lookup-search-icon" />
      <input ref={ref} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={Boolean(dropdown)} aria-controls={dropdown ? `${id}-list` : undefined} aria-activedescendant={currentActive >= 0 ? `${id}-option-${currentActive}` : undefined} aria-describedby={`${id}-status`} autoComplete="off" spellCheck={false} className="lookup-input" value={value} placeholder={placeholder} required={required} disabled={disabled} autoFocus={autoFocus}
        onChange={event => change(event.target.value)} onFocus={() => { setOpen(true); setActive(-1); }}
        onCompositionStart={() => { composing.current = true; invalidate(); setIme(true); }} onCompositionEnd={() => { composing.current = false; setIme(false); }}
        onKeyDown={event => {
          if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); if (!items.length || loading) return; setActive(index => event.key === "ArrowDown" ? (index+1)%items.length : index <= 0 ? items.length-1 : index-1); }
          else if (event.key === "Enter") { event.preventDefault(); if (currentActive >= 0) choose(items[currentActive]); else if (onSubmitText) { close(); onSubmitText(value); } else setOpen(true); }
          else if (event.key === "Escape") { if(open) event.preventDefault(); close(); }
          else if (event.key === "Tab") close();
        }} />
      {value && !disabled && <IconButton size="sm" variant="ghost" icon="close" label={clearLabel ?? `Clear ${label}`} onClick={() => {change(""); onClear?.(); ref.current?.focus();}} />}
    </div>
    <span id={`${id}-status`} role="status" aria-live="polite" className="sr-only">{open && !loading && !ime ? error ?? `${items.length} suggestions. Use arrow keys to choose, then Enter.` : ""}</span>
    {portalDropdown ? position && dropdown && createPortal(dropdown, document.body) : dropdown}
  </div>;
}
