CourtLoad was renamed to CourtLens on 2026-10-07; identifiers below are historical.

# Fontshare candidates for the dense CourtLoad interface

Checked 2026-10-01. Font choice remains optional and deferred until the layout and analytical workflows are settled. This is evidence for a later selection, not a chosen design system. Only this research document was added; no application assets, font installation, mockups, or interface code were created.

Two combinations merit a later comparison: **Clash Grotesk headings with Switzer interface/data text**, and **Public Sans interface/headings with optional JetBrains Mono numeric text**. The first offers more distinctive headings; the second has clearer redistribution permissions for a reproducible repository/Compose release. These are design judgments, not Fontshare's endorsement of CourtLoad or a measured usability ranking.

## Verified families and delivery

Official family pages were inspected in a JavaScript-enabled browser. Their public Fontshare API metadata was also checked; it is evidence of current delivery, not a documented integration contract to depend on at application runtime.

| Family | Official page and inspected metadata | Weights/styles currently observed | WOFF2/variable delivery | License |
| --- | --- | --- | --- | --- |
| Switzer, version 1.2 | [Family](https://www.fontshare.com/fonts/switzer), [metadata](https://api.fontshare.com/v2/fonts/slug/switzer) | Upright 100–900 in 100-step static weights, matching italics: 18 static styles. | Upright and italic variable styles; upright `wght` 100–900. Static Regular and upright variable WOFF2 fetched successfully. | Closed source, ITF Free Font License. |
| Clash Grotesk, version 1.0 | [Family](https://www.fontshare.com/fonts/clash-grotesk), [metadata](https://api.fontshare.com/v2/fonts/slug/clash-grotesk) | Upright 200–700 in 100-step static weights: 6 static styles. No italic style listed. | One upright variable style, `wght` 200–700. Static Regular and variable WOFF2 fetched successfully. | Closed source, ITF Free Font License. |
| Public Sans, version 2.001 | [Family](https://www.fontshare.com/fonts/public-sans), [metadata](https://api.fontshare.com/v2/fonts/slug/public-sans) | Upright 100–900 in 100-step static weights, matching italics: 18 static styles. | Upright and italic variable styles; upright `wght` 100–900. Static Regular and upright variable WOFF2 fetched successfully. | Open source, SIL Open Font License. |
| JetBrains Mono, version 2.251 | [Family](https://www.fontshare.com/fonts/jet-brains-mono), [metadata](https://api.fontshare.com/v2/fonts/slug/jet-brains-mono) | Upright 100–800 in 100-step static weights, matching italics: 16 static styles. | Upright and italic variable styles; upright `wght` 100–800. Static Regular and upright variable WOFF2 fetched successfully. | Open source, SIL Open Font License. |

“Clash Grotesk” and “Clash Display” are different families. This investigation checked Clash Grotesk. Its description calls the numerals proportional and describes a design with narrow letter openings; that is a reason to assess its small-size readability before assigning it to compact table labels. [Clash Grotesk](https://www.fontshare.com/fonts/clash-grotesk)

## Numerals: documentation versus actual inspection

Font-family names and CSS `tabular-nums` declarations do not prove that a given file supplies a tabular alternate. Public API feature tags, the downloaded WOFF2 feature/advance tables, and selected browser rendering measurements were checked without changing font files.

| Family | Declared/inspected OpenType `tnum` feature | Measured numeral behavior | Consequence for numeric tables |
| --- | --- | --- | --- |
| Switzer | Absent in API metadata and inspected GSUB tables. | Regular and the variable default have equal advance widths for every digit 0–9: 576 units at 1,000 units/em. Chromium measurements at variable weights 400, 500, and 600 also produced equal digit widths; at 32px each was approximately 18.432px with kerning disabled. | Digits are already equally spaced in the checked files. Do not describe this as a supported `tnum` alternate; CSS cannot enable a nonexistent alternate. Switzer is a plausible numeric-table face. |
| Clash Grotesk | Absent in API metadata and inspected GSUB tables. | Regular has proportional digit advances, ranging from 292 for “1” to 649 for “0” at 1,000 units/em. Variable browser measurements at 400/500/600 remain proportional. | Keep dense numeric values in Switzer or another validated face. `tabular-nums` alone will not fix Clash Grotesk. |
| Public Sans | Present in metadata and inspected GSUB tables. | Regular/default digits are proportional. Applying its inspected `tnum` substitution produces equal advances of 1,400 units at 2,000 units/em for all digits in both checked files. | Explicitly request tabular figures for tables; default figures should not be assumed tabular. |
| JetBrains Mono | No `tnum` tag in the checked files; it is a monospaced family. | Every digit has a 600-unit advance at 1,000 units/em in Regular and the variable default. | Suitable for an optional numeric/code role. Disable programming ligatures where they could obscure literal identifiers/operators. |

The feature lists are visible in [Switzer metadata](https://api.fontshare.com/v2/fonts/slug/switzer), [Clash metadata](https://api.fontshare.com/v2/fonts/slug/clash-grotesk), [Public Sans metadata](https://api.fontshare.com/v2/fonts/slug/public-sans), and [JetBrains Mono metadata](https://api.fontshare.com/v2/fonts/slug/jet-brains-mono). Width measurements are this investigation's direct observations, not quoted website claims. JetBrains documents its monospaced construction and distinguishable symbols on its [official font page](https://www.jetbrains.com/lp/mono/).

The inspected eight files contain the characters in the bounded sample `Nikola Jokić Luka Dončić Kristaps Porziņģis +−%–`. This is a sample coverage check, not proof of every NBA name, script, or mathematical symbol. Equal digit widths do not align arbitrary signs, decimal points, or inconsistent precision automatically; table formatting, right alignment, and sign/decimal conventions still need design decisions.

## License and self-hosting basis

The current **ITF Free Font License, version 2.0 dated 17 Aug 2026**, permits personal/commercial use and self-hosting official files for the licensee's own sites/apps; Fontshare's API is optional. It prohibits modification, subsetting, format conversion, and broader font redistribution, including through repositories and download services. External collaborators obtain their own copies. Own-site/app self-hosting remains expressly permitted. [Current ITF license](https://www.fontshare.com/licenses/itf-ffl)

For the Switzer/Clash pair, preserve official WOFF2 bytes and resolve the eventual repository/container distribution method against those terms before adding assets. A public repository containing these binaries must not be assumed equivalent to serving the owner's own interface. An owner-side acquisition step plus local caching is a possible packaging approach to assess; it has not been chosen or implemented.

The **SIL Open Font License 1.1** permits software bundling and redistribution when each copy retains copyright and license notices, with additional conditions for modifications/reserved names. Public Sans and JetBrains Mono are explicitly identified as OFL fonts by Fontshare. This makes them a stronger candidate for committed assets and offline reproducible packaging. [Fontshare OFL](https://www.fontshare.com/licenses/sil-ofl), [Public Sans](https://www.fontshare.com/fonts/public-sans), [JetBrains Mono](https://www.fontshare.com/fonts/jet-brains-mono)

For either combination, self-hosting selected files is the proposed deployment approach so normal local operation does not need a font CDN. Do not choose hosted CSS imports as the core runtime dependency merely because Fontshare provides them. Preserve source/version/hash and the applicable license in the eventual asset manifest; verify the installed frontend's local-font behavior during implementation.

## Two combinations for later review

| Combination | Proposed role split | Benefit | Tradeoff to evaluate |
| --- | --- | --- | --- |
| Clash Grotesk + Switzer | Clash at 500/600 for larger page/section headings; Switzer at 400/500/600 for controls, labels, names, explanatory text, and numeric tables. | Distinctive headings plus verified equally spaced Switzer digits. | Two similar sans families may add less visual hierarchy than expected. Clash's narrow openings and the closed-font packaging terms require review. |
| Public Sans + optional JetBrains Mono | Public Sans for headings/navigation/body; tabular Public Sans or selected JetBrains Mono for numeric values, query identifiers, and code. | Explicit Public Sans tabular feature, an optional monospaced role, and OFL packaging. | Public Sans tabular figures are 0.7em wide in the inspected substitutions, versus 0.6em for JetBrains Mono and 0.576em for Switzer. Actual column width and reading comfort should decide the numeric face. |

Using Public Sans alone with tabular figures, or Switzer alone with weight hierarchy, remains a valid simpler outcome. A two-family requirement should not be introduced before comparing them at the actual intended table/control sizes.

The UI/UX skill's focused `dense dashboard tabular numbers` typography search returned its Dashboard Data recommendation, separating data/code typography from labels. This supplied role guidance only; its Fira pairing was not adopted as a Fontshare recommendation. Later acceptance should check intended density, player-name coverage, signed decimals/percentages, clipping, loading/fallback layout, keyboard zoom, and narrow screens. No visual usability comparison has been conducted here.

## Bounded acquisition evidence

Files were downloaded only to `/tmp/courtload-fontshare-research`, with a 1MB bound per file. Total explicit inspected-font bytes: 341,240. No system font installation or application asset copy occurred. Regular and upright variable files were inspected; italics and every static weight were not downloaded.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| Switzer Regular | 16,728 | `ddd9595560c35725e00d01667ce9bee519d245620e610844f0dd149df10b5d5f` |
| [Switzer Variable](https://cdn.fontshare.com/wf/HJHZ26OECMTXRH7JXPFC7EVIHDSLT2RA/LJRNLR7WCPF3PY3SZ7B2LHNUTQMFNCHL/4MCJYGQDIOOXHWSIIB2OYNDBEALJSOGN.woff2) | 43,220 | `d1bf801ffb1a6096def70a7c532255722ad87d948b13a8a586e342f7091f8ee4` |
| Clash Grotesk Regular | 19,616 | `03ad7ecf7510c77f35306f852e5c4de1161e3e70b05b3848dc57b782bf055c68` |
| [Clash Grotesk Variable](https://cdn.fontshare.com/wf/5TRO2J3HJNIQODLQ4CTSMGSLAWSE5YUY/GHXENXHZCDIOE5E73364PNNASRNO3JVW/GLZTRU2GIKPV5HYT3E6HDLWOXAWPNZDV.woff2) | 47,264 | `3c56fcff3a74054781e42a712f7dc2b874eec7a646c7282464c5d4cad1a36186` |
| Public Sans Regular | 29,552 | `7058af062522c6677dafeb338162be9b4d3d978bd6ea8569ee37e8ab96cb0ef4` |
| [Public Sans Variable](https://cdn.fontshare.com/wf/AB3W4RTJDTV2YGSHJ3RYQNITFFFTVTHJ/HMR5BYPT5TY2T3WCBIBJNUHOZ7BZTM5T/JCGGIZDCUA7N5MMORGBTNWUTQEZEM2D3.woff2) | 41,944 | `5b51cd397718e82956721fa3da846367c4bfdf2ed502ed1fd03d07a4e74b9cb3` |
| JetBrains Mono Regular | 51,432 | `2dc43470e34a95cb89a3d8ce41856205ddb3a2b98753b5eff371d76048868e23` |
| [JetBrains Mono Variable](https://cdn.fontshare.com/wf/NETZQ54ZOKLTIGCF4PEMSPBMZ4WH6PJS/IU37JRVORJNT7W7AFXSHPFH7UV2F5ZWX/ZFWC2YLUJ7YZ5NZDUAYWIG2A6AZGG5QH.woff2) | 91,484 | `03025ea79e854ffd735e15a166c4d86e3d9183fafd6f29927eb12d759d1bee2d` |

File locators were taken from the official family metadata and the site's `.woff2` delivery convention. They may change. Family download controls should be rechecked when selecting/package-acquiring a font. Temporary measurements and cached pages are working materials; the durable findings and identities are recorded above.

## Limits

Web text extraction returned JavaScript-only shells for several family/license pages; Chromium inspection resolved their current contents. The measurements establish the checked files' feature/spacing behavior, not universal readability or equal behavior in every browser/weight. No dark dashboard mockup, latency benchmark, complete glyph-coverage audit, or release packaging test was performed. Owner selection and visual acceptance remain later planning decisions.
