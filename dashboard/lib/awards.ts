/**
 * Presentation of Basketball-Reference honours and season award codes (player bio `reference`).
 * Wins of the league's major awards and titles are highlighted; vote finishes and selections
 * stay neutral. Text keeps the source's wording, lightly tidied.
 */

/** Season award codes, e.g. "MVP-2" (second in voting), "DPOY-1" (won), "NBA1" (All-NBA first). */
const MAJOR_AWARDS = ["MVP", "DPOY", "ROY", "6MOY", "SMOY", "MIP", "CPOY"];

/** True for a won major award ("MVP-1", "DPOY-1"); vote finishes and team selections are not. */
export function isAwardWin(code: string): boolean {
  const [award, place] = code.split("-");
  return place === "1" && MAJOR_AWARDS.includes(award);
}

/** A season's award chips, without "AS" (All-Star seasons are starred beside the year instead). */
export function seasonAwardChips(codes: string[] | undefined): { code: string; win: boolean }[] {
  return (codes ?? []).filter(code => code !== "AS").map(code => ({ code, win: isAwardWin(code) }));
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
