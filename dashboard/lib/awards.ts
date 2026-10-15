/**
 * Presentation of Basketball-Reference honours and season award codes (player bio `reference`).
 * Wins of the league's major awards and titles are highlighted; vote finishes and selections
 * stay neutral. Source codes get compact labels and full accessible descriptions.
 */

/** Season award codes, e.g. "MVP-2" (second in voting), "DPOY-1" (won), "NBA1" (All-NBA first). */
const MAJOR_AWARDS = ["MVP", "DPOY", "ROY", "6MOY", "SMOY", "MIP", "CPOY"];

const AWARD_NAMES: Readonly<Partial<Record<string, { label: string; name: string }>>> = {
  MVP: { label: "MVP", name: "Most Valuable Player" },
  DPOY: { label: "DPOY", name: "Defensive Player of the Year" },
  ROY: { label: "Rookie", name: "Rookie of the Year" },
  "6MOY": { label: "6th Man", name: "Sixth Man of the Year" },
  SMOY: { label: "6th Man", name: "Sixth Man of the Year" },
  MIP: { label: "MIP", name: "Most Improved Player" },
  CPOY: { label: "Clutch", name: "Clutch Player of the Year" },
};

const TEAM_SELECTIONS: Readonly<Partial<Record<string, { label: string; description: string }>>> = {
  NBA1: { label: "All-NBA 1st", description: "All-NBA First Team" },
  NBA2: { label: "All-NBA 2nd", description: "All-NBA Second Team" },
  NBA3: { label: "All-NBA 3rd", description: "All-NBA Third Team" },
  DEF1: { label: "All-Def 1st", description: "All-Defensive First Team" },
  DEF2: { label: "All-Def 2nd", description: "All-Defensive Second Team" },
};

function ordinal(value: number): string {
  const tens = value % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][value % 10] ?? "th";
  return `${value}${suffix}`;
}

/** True for a won major award ("MVP-1", "DPOY-1"); vote finishes and team selections are not. */
export function isAwardWin(code: string): boolean {
  const [award, place] = code.split("-");
  return place === "1" && MAJOR_AWARDS.includes(award);
}

/** A season's award chips, without "AS" (All-Star seasons are starred beside the year instead). */
export function seasonAwardChips(codes: string[] | undefined): { code: string; label: string; description: string; win: boolean }[] {
  return (codes ?? []).filter(code => code !== "AS").map(code => {
    const selection = TEAM_SELECTIONS[code];
    if (selection) return { code, ...selection, win: false };
    const vote = code.match(/^([A-Z0-9]+)-([1-9]\d*)$/);
    const award = vote && AWARD_NAMES[vote[1]];
    if (vote && award) {
      const win = isAwardWin(code);
      const place = ordinal(Number(vote[2]));
      return { code, label: `${award.label} ${win ? "Winner" : place}`,
        description: win ? `${award.name} winner` : `${place} in ${award.name} voting`, win };
    }
    return { code, label: code, description: code, win: false };
  });
}

const TOP_HONOURS = [/\bNBA Champ\b/, /\bFinals MVP\b/, /^(\d+x |\d{4}-\d{2} )?MVP$/, /\bDef\. POY\b/, /Hall of Fame/];

export interface Honour {
  label: string;
  top: boolean;
}

/** Career honours in the source's order with titles and major awards first: "7x All Star" -> "7× All-Star". */
export function honours(list: string[] | undefined): Honour[] {
  const tidy = (text: string) => text.replace(/^(\d+)x /, "$1× ").replace(/\bAll Star\b/g, "All-Star");
  const items = (list ?? []).map(text => ({ label: tidy(text.trim()), top: TOP_HONOURS.some(pattern => pattern.test(text.trim())) }));
  return [...items.filter(item => item.top), ...items.filter(item => !item.top)];
}
