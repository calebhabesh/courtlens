/**
 * Flags for the countries the NBA player index lists: 60×45 PNGs in public/flags, rendered at 3×
 * the 20×15 display size from flag-icons 7.2.3 (MIT; public/flags/LICENSE) because the SVGs with
 * coats of arms run to 180 KB. Keys are the index's own spellings, so
 * "DRC" and "Democratic Republic of the Congo" both resolve. An unlisted name gets no flag.
 */
const CODES: Record<string, string> = {
  "Angola": "ao", "Antigua and Barbuda": "ag", "Argentina": "ar", "Australia": "au", "Austria": "at",
  "Bahamas": "bs", "Belgium": "be", "Belize": "bz", "Bosnia and Herzegovina": "ba", "Brazil": "br",
  "British Virgin Islands": "vg", "Bulgaria": "bg", "Cabo Verde": "cv", "Cameroon": "cm", "Canada": "ca",
  "China": "cn", "Colombia": "co", "Congo": "cg", "Croatia": "hr", "Cuba": "cu", "Czech Republic": "cz",
  "Democratic Republic of the Congo": "cd", "DRC": "cd", "Denmark": "dk", "Dominican Republic": "do",
  "Egypt": "eg", "Estonia": "ee", "Finland": "fi", "France": "fr", "Gabon": "ga", "Georgia": "ge",
  "Germany": "de", "Ghana": "gh", "Greece": "gr", "Guinea": "gn", "Haiti": "ht", "Iran": "ir",
  "Ireland": "ie", "Israel": "il", "Italy": "it", "Jamaica": "jm", "Japan": "jp", "Latvia": "lv",
  "Lebanon": "lb", "Lithuania": "lt", "Macedonia": "mk", "North Macedonia": "mk", "Mali": "ml",
  "Mexico": "mx", "Montenegro": "me", "Netherlands": "nl", "New Zealand": "nz", "Nicaragua": "ni",
  "Nigeria": "ng", "Norway": "no", "Panama": "pa", "Poland": "pl", "Portugal": "pt", "Puerto Rico": "pr",
  "Romania": "ro", "Russia": "ru", "Saint Lucia": "lc", "St. Vincent & Grenadines": "vc", "Scotland": "gb-sct",
  "Senegal": "sn", "Serbia": "rs", "Slovenia": "si", "South Korea": "kr", "South Sudan": "ss", "Spain": "es",
  "Sudan": "sd", "Sweden": "se", "Switzerland": "ch", "Tanzania": "tz", "Trinidad and Tobago": "tt",
  "Tunisia": "tn", "Turkey": "tr", "Uganda": "ug", "Ukraine": "ua", "United Kingdom": "gb", "Uruguay": "uy",
  "US Virgin Islands": "vi", "USA": "us", "Venezuela": "ve",
};

/** The flag image path for an index country name, or null when there is none. */
export function countryFlag(country: string | null | undefined): string | null {
  const code = country ? CODES[country.trim()] : undefined;
  return code ? `/flags/${code}.png` : null;
}

/** Every vendored flag code, for the asset check. */
export const FLAG_CODES = [...new Set(Object.values(CODES))].sort();
