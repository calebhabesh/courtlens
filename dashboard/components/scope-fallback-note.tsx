// Site links SL02: the one line a player or team page shows after a link asked for a season (or
// playoffs) it has no games in and the page opened the closest one instead.
export function ScopeFallbackNote({ note }: { note: string | null }) {
  if (!note) return null;
  return <p className="scope-fallback-note" role="note">{note}</p>;
}
