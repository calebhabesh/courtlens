# PF04 canonical route/entity inventory

All 52 App Router pages inspected; shell global navigation uses the shared engine on every route. Controls are captured from transitive local component imports in [the raw inventory](route-inventory.json). API routes and compatibility redirects introduce no additional entry fields.

| Route | Entity entry or justified other control |
| --- | --- |
| `/blog` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/calculator` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/compare` | Shared Player A/B fields; canonical hidden GET inputs; replay date is context. |
| `/contracts/[team]` | Named Explicit contract team dropdown is an ordinary all/unresolved finance filter over its separate canonical finance registry; never inferred from basketball membership. Search is free-text contract/source-note filtering; book IDs/import hashes are artifact/operator identifiers. |
| `/contracts` | Named Explicit contract team dropdown is an ordinary all/unresolved finance filter over its separate canonical finance registry; never inferred from basketball membership. Search is free-text contract/source-note filtering; book IDs/import hashes are artifact/operator identifiers. |
| `/data-status` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/evaluation` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/forecasts` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/free-agency` | Named Explicit contract team dropdown is an ordinary all/unresolved finance filter over its separate canonical finance registry; never inferred from basketball membership. Search is free-text contract/source-note filtering; book IDs/import hashes are artifact/operator identifiers. |
| `/investigations` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/investigations/saved/[id]` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/last-games` | Shared Switch player action picker; canonical player destination. Chart controls are non-entity. |
| `/learning` | Shared Lesson player; pinned release and appearance window preserved. |
| `/live/[date]` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/live/games/[id]` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/live` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/matchups` | Shared Player/Offensive player/Defender pickers. Display team/zone are ordinary returned-fact filters. |
| `/methodology` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/patch-notes` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/planner` | Shared Drop/Add candidate fields restricted to authenticated roster/watchlist candidates; local suggestions make no public catalog or model request. |
| `/players/[id]` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/players` | Shared Team, Focal/Together/Apart/Exact unit/Candidate pickers; bounded named chips. Scope and sample controls retain canonical values. |
| `/playoffs/[seriesId]` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/playoffs` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/rankings` | Shared Add player to board action picker, excludes already ranked IDs. Board titles/notes/aggregation select personal artifacts. |
| `/research/adjusted-shooting` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/research/ask` | Manual operations get shared player/team argument fields; JSON remains advanced exact-argument editor. Questions/context are non-entity. PF08 retains ownership of conversation redesign. |
| `/research/case-studies` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/research/defensive-matchups` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/research/distributions` | Shared Target player; preset named-player buttons remain shortcuts. Dates, windows, dimensions and display selectors are analytical controls. |
| `/research/epv` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/research/expected-shots` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/research/operation` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/research/rapm` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/research/similarity` | Shared Target player; preset named-player buttons remain shortcuts. Dates, windows, dimensions and display selectors are analytical controls. |
| `/research/trends` | Shared Target player; preset named-player buttons remain shortcuts. Dates, windows, dimensions and display selectors are analytical controls. |
| `/roster-shapes` | Shared Team field. Positions/projected minutes are user-assigned allocation inputs. |
| `/schedule` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/settings` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/shot-aftermath` | Shared Player/Offensive player/Defender pickers. Display team/zone are ordinary returned-fact filters. |
| `/shot-profile-twin` | Shared Player/Offensive player/Defender pickers. Display team/zone are ordinary returned-fact filters. |
| `/showcase` | Shared Add or jump to player action picker; canonical player destination. |
| `/six-factor-rapm` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/stat-line-shift` | Shared Team, Focal/Together/Apart/Exact unit/Candidate pickers; bounded named chips. Scope and sample controls retain canonical values. |
| `/stats` | Shared Team, Focal/Together/Apart/Exact unit/Candidate pickers; bounded named chips. Scope and sample controls retain canonical values. |
| `/team-compare` | Shared Team A/B fields; scenario sliders are numeric. |
| `/teams/[id]` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/teams` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/tierlist` | Shared Add player to tier action picker, excludes assigned IDs. Explicit named tier select preserves assignment target. |
| `/wingspan` | No primary entity-entry field. Named records/links, returned-row filters, dates, model-run/artifact selectors and operator content remain their existing roles. |
| `/wowy` | Shared Team, Focal/Together/Apart/Exact unit/Candidate pickers; bounded named chips. Scope and sample controls retain canonical values. |

The legacy PlayerSearch fallback is a directory text query returning explicit named destination links, not an entity-required form. Measurement comparisons select source observations from named returned records, not public player identities. Team explorer name filtering, result-row actions, playoff/Live linked identities and saved-view cohort filters need no committed identity search. Scope catalog polish, recurring table guides and assistant routing remain PF05–PF08 work.
