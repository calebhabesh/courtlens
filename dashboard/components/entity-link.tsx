"use client";

// Site links (docs/site-links-plan.md, D1): every player, team, game and series name is a real
// anchor through next/link, or plain text when the row has no id or the link would point at the
// page it sits on, so call sites never branch. No viewport or hover prefetch: a table of names
// must not send a request per row to the shared VPS.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/kit/recipes";
import { gameHref, isSelfLink, playerHref, seriesHref, teamHref, type EntityScope, type GameRef } from "@/lib/entity-links";

/** `entity`: names in tables, cards and headers. `prose`: links inside running text.
 * `block`: a logo or photo beside a name; only the child marked `.entity-link-text` takes the hover.
 * `stretched`: a card's primary link, whose hit area covers the card (entity links sit above it). */
export type EntityLinkVariant = "entity" | "prose" | "block" | "stretched";

interface CommonProps {
  children: ReactNode;
  className?: string;
  variant?: EntityLinkVariant;
  /** Accessible name when the visible content is only an image or a code. */
  label?: string;
  title?: string;
}

const VARIANT_CLASS: Record<EntityLinkVariant, string> = {
  entity: "entity-link",
  prose: "entity-link is-prose",
  block: "entity-link is-block",
  stretched: "entity-link is-stretched",
};

export function EntityAnchor({ href, children, className, variant = "entity", label, title }: CommonProps & { href: string | null }) {
  const pathname = usePathname();
  if (!href || isSelfLink(href, pathname)) {
    return <span className={className} title={title}>{children}</span>;
  }
  return (
    <Link href={href} prefetch={false} className={cx(VARIANT_CLASS[variant], className)} aria-label={label} title={title}>
      {children}
    </Link>
  );
}

export function PlayerLink({ id, scope, ...rest }: CommonProps & { id: string | number | null | undefined; scope?: EntityScope }) {
  return <EntityAnchor href={playerHref(id, scope)} {...rest} />;
}

/** `team` is a franchise id, tricode or era code; the href names the franchise (D6). */
export function TeamLink({ team, scope, ...rest }: CommonProps & { team: string | number | null | undefined; scope?: EntityScope }) {
  return <EntityAnchor href={teamHref(team, scope)} {...rest} />;
}

export function GameLink({ game, tab, ...rest }: CommonProps & { game: GameRef | null | undefined; tab?: string | null }) {
  return <EntityAnchor href={gameHref(game, { tab })} {...rest} />;
}

export function SeriesLink({ slug, scope, ...rest }: CommonProps & { slug: string | null | undefined; scope?: Pick<EntityScope, "beforeDate" | "releaseId"> }) {
  return <EntityAnchor href={seriesHref(slug, scope)} {...rest} />;
}
