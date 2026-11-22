import { Badge } from "./ui/badge";

/** Which team is at home: a small HOME or AWAY tag beside a team's name wherever a game shows both teams. */
export function VenueTag({ side, className = "" }: { side: "home" | "away"; className?: string }) {
  return <Badge className={`venue-tag ${className}`} data-side={side}>{side === "home" ? "Home" : "Away"}</Badge>;
}
