"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { nameCurrentPage, pageLabel, previousPage, recordVisit } from "@/lib/nav-trail";
import { Button } from "./kit";

export interface BackTarget { href: string; label: string }

/**
 * Listens for a bare Esc that nothing else owns: no field has focus, and no dialog, menu or
 * listbox was open when the key went down. The overlay check runs in the capture phase, before an
 * overlay's own Esc closes it, so closing a drawer never also leaves the page. Returns the cleanup.
 */
export function onBareEscape(action: () => void): () => void {
  let overlayOpen = false;
  const capture = (event: KeyboardEvent) => {
    if (event.key === "Escape") overlayOpen = Boolean(document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox'], dialog[open]"));
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || overlayOpen || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const element = event.target as HTMLElement | null;
    if (element?.closest("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    action();
  };
  window.addEventListener("keydown", capture, true);
  window.addEventListener("keydown", onKey);
  return () => { window.removeEventListener("keydown", capture, true); window.removeEventListener("keydown", onKey); };
}

/** This page's URL, as the trail records it. */
export function useCurrentHref(): string {
  const pathname = usePathname();
  const query = useSearchParams()?.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Records every page in the tab's trail; mounted once in the root layout. */
export function NavTrailRecorder() {
  const href = useCurrentHref();
  useEffect(() => { recordVisit(href); }, [href]);
  return null;
}

/** A drill-in page names itself for the Back button of whatever it opens next. */
export function useNavLabel(label: string | null | undefined) {
  const href = useCurrentHref();
  useEffect(() => {
    if (!label) return;
    recordVisit(href);
    nameCurrentPage(href, label);
  }, [href, label]);
}

/** `useNavLabel` for server-rendered pages. */
export function NavLabel({ label }: { label: string }) {
  useNavLabel(label);
  return null;
}

/**
 * "Back to …" on a drill-in page (Design Language, Back navigation): the page this one was opened
 * from in this tab, else `parent`, the page it belongs to. Esc does the same when no field, menu or
 * dialog holds it. It appears after hydration (the trail is session storage); its row holds the
 * space meanwhile.
 */
export function BackButton({ parent, onBack }: { parent: BackTarget; onBack?: (target: BackTarget) => void }) {
  const router = useRouter();
  const href = useCurrentHref();
  const [target, setTarget] = useState<BackTarget | null>(null);
  const { href: parentHref, label: parentLabel } = parent;
  useEffect(() => {
    recordVisit(href);
    const previous = previousPage(href);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session storage is browser-only
    setTarget(previous ? { href: previous.href, label: previous.label ?? pageLabel(previous.href) } : { href: parentHref, label: parentLabel });
  }, [href, parentHref, parentLabel]);
  const go = (to: BackTarget) => { if (onBack) onBack(to); else router.push(to.href); };

  // Attached before paint so the button never shows dead.
  useLayoutEffect(() => {
    if (!target) return;
    return onBareEscape(() => { if (onBack) onBack(target); else router.push(target.href); });
  }, [target, onBack, router]);

  return <div className="back-button-row">
    {target && <Button size="xs" variant="primary" icon="left" onClick={() => go(target)}>
      Back to {target.label}<kbd className="back-button-kbd" aria-hidden="true">Esc</kbd>
    </Button>}
  </div>;
}
