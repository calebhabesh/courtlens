# B36 typography selection review

Subsequent owner selection and packaging: [B36b verified acceptance](b36b-typography-acceptance.md).
The comparison findings below remain dated B36a evidence.

2026-10-04. **B36a comparison verified; owner selection and B36b installation pending.**
Implementation choice: current Codex session, no delegated agents or model override.
The application retains Space Grotesk and IBM Plex Mono, as required by the
[feature contract](../design/replica-feature-contract.md#typography-deferred).

Open the [screenshot gallery](b36-comparison-reviewed/index.html), also served locally
at `http://127.0.0.1:3136`, and the [measurement manifest](b36-comparison-reviewed/verification.json).
The gallery compares actual retained Stats, scatter, finance and saved conversational
results, rather than a synthetic dashboard. Click each image to inspect full resolution.

## Recommendation and measured tradeoffs

**Recommend Public Sans for interface/headings with JetBrains Mono for the existing
data/code roles.** This is a design recommendation for owner review, not measured
user preference. It retains a familiar numeric width and permits reproducible
offline distribution with copyright/license notices. Public Sans alone is a simpler
alternative, with wider tabular figures and proportional identifier characters.

| Option | Data digit width at 14px / weight 400 | Stats table width at 1440px | First row height | Candidate font bytes |
| --- | ---: | ---: | ---: | ---: |
| Existing Space Grotesk + IBM Plex Mono | 8.406px | 1390px | 45.688px | Existing packaged assets; unchanged |
| Switzer + Clash Grotesk headings | 8.078px | 1390px | 45.688px | 90,484 |
| Public Sans with tabular figures | 9.812px | 1415.313px | 45.688px | 41,944 |
| Public Sans + JetBrains Mono data | 8.406px | 1400.422px | 45.688px | 133,428 |

Each candidate's data digits have equal measured advances at weights 400, 500 and
600. Public Sans needs `font-variant-numeric: tabular-nums`; Switzer's inspected
metadata declares no `tnum` alternate but its digits are already equally spaced.
Clash remains proportional even with that CSS declaration and belongs in headings.
The slight table expansion in the Public Sans options stays inside the existing
horizontal table scroller. Names, signed decimals, percentages, unknown values,
contract terms and long identifiers appear in the screenshots at existing density.

The bounded browser fallback comparison covers `Jokić`, `Dončić`, `Porziņģis`,
`Şengün`, signs/percentages and distinguishable `1Il0O` characters. No candidate
character depended on the differing serif/monospace fallback widths. The current
IBM Plex Mono data face did depend on fallback for `ćčņģŞ`; the current interface
face passed this bounded sample. This is a browser width heuristic, supported by
rendered specimens at 12/14/18px, not an exhaustive cmap audit or every-name guarantee.

## Verification and boundaries

- **16 real-service desktop comparisons**, four candidates across four surfaces;
  **32 new screenshots**, including glyph specimens and Stats at 375px, landscape
  and CSS 200% zoom. The Stats query retains the public release ID, regular season,
  2023–24 and exclusive 2024-04-15 cutoff; 50 rows render for every font.
- No body overflow in those measured layouts. Keyboard Tab reaches the skip link
  for all candidates; reduced motion is enabled. Full keyboard workflows and
  responsive finance/chat acceptance are not newly claimed here.
- **Zero browser page errors**. All observed API requests are GET except four
  read-only finance query POSTs. Saved inventory is exactly unchanged. No provider
  calls, Live leases, acquisition/publication, training or analytical saves occur.
- The browser first settles the existing fonts, then applies the candidate CSS.
  Isolated font-swap layout-shift sums range from zero to **0.028815**. This is not
  production cold-load CLS: it excludes initial navigation, uses browser-routed
  temporary fonts, and sums observed shifts rather than CLS session windows.
  Final `next/font/local` preload/fallback and cold-load acceptance remain B36b.
- `node --check scripts/compare_b36_typography.cjs` passes, and the full comparison
  harness executes successfully. Application code is unchanged; B35's application
  test/lint/build results remain dated evidence and are not reported as rerun.

The comparison uses the retained **B35 Next.js 16.3.5 production build** on port 3135
and a local FastAPI process against retained PostgreSQL on port 8000. AI and Live
are explicitly disabled. It reuses the B35 build rather than claiming a fresh B36
build. The owner's active development server and existing dirty work are preserved.
Initial probe directories remain working evidence; `b36-comparison-reviewed` is the
accepted result. The first probe used an overly exact Fontshare license text locator;
the corrected harness waits for fully rendered license content. A later capture
fix restores scroll position after specimen screenshots before responsive captures.

## Acquisition and packaging

Official Fontshare metadata and current license pages were rechecked on 2026-10-04.
All four official upright variable WOFF2 hashes match the earlier research hashes;
source/version/weight/license identities and byte counts are in the manifest.
Source assets are fetched only for the comparison into an OS temporary directory,
used through browser request interception, and removed in `finally`. No font binaries
are added to the application, repository, Docker build, system font installation or
public server. The gallery distributes rendered images only.

[ITF FFL 2.0](https://www.fontshare.com/licenses/itf-ffl) permits owner application
self-hosting but restricts repository redistribution and font modification. If the
owner selects Switzer/Clash, implement a verified owner-side local acquisition/cache
step, preserving official bytes. Public Sans/JetBrains Mono carry
[SIL OFL](https://www.fontshare.com/licenses/sil-ofl); bundle the relevant font
copyright and license notices with any chosen assets. Fully rendered license text
and hashes are retained in the comparison directory. Normal analytical operation
must not depend on a font CDN for either choice.

## Next boundary

Owner selection is explicitly required by the replica feature contract, not an
approval inferred from a skill. After selection, B36b applies legitimate local
packaging, verifies the chosen production font requests/hashes, cold-load CLS,
numerals/glyphs, density, responsive/zoom paths and relevant dashboard checks.
B32 actual changing-game/finality acceptance and existing language/source/model
gates remain independent and open. B36 as a whole is not complete.
