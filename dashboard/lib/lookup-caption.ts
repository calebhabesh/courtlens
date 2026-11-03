import type { LookupItem } from "./types";

/** "aka Wemby, Vic, Alien": a player's verified nicknames, the matched one first. */
export function nicknameCaption(item: LookupItem): string | null {
  const names = item.nicknames?.length ? item.nicknames : item.matched_alias ? [item.matched_alias] : [];
  return names.length ? `aka ${names.join(", ")}` : null;
}
