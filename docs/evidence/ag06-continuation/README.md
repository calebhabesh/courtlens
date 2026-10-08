# AG06 measurement continuation — 2026-10-08

[Offline preflight](preflight-2026-10-08.json) confirms that no implementation block
in the requested AG06 → AG07 → AG08 sequence is currently eligible. Gemini is the
only configured provider with a key, and the owner prohibits Gemini calls for this
continuation. Anthropic and OpenAI have no configured key. This check made zero
provider calls; it does not establish quota availability or model quality.

The AR02 fixture baseline checksum matches the retained AG06 summary. Its six
warehouse categories independently total **255/279 exact answers (91.40%)**.
All three original AG06 report checksums match the summary; none is complete.
Both frozen corpus checksums and split contracts pass. Existing evidence and
corpus files (3,002 files checked) were preserved.

The current runner defaults to IM07's separate corpus: **191 development cases ×
3 runs = 573 planned evaluation turns**, including 393 warehouse-category turns.
The original AG06 corpus remains at 180 development cases × 3 runs = 540 turns.
Both retain the same 24-case fresh holdout. These counts describe the resume
workload, not completed measurement. IM06/IM07 verification was not repeated.

When a permitted provider has working access, resume through the existing runner
with `make eval-assistant PROVIDER=<provider>` and, if needed, an explicit
`MODEL=<model>`. Use its timestamped default report/transcript paths or new explicit
paths; preserve retained artifacts. The default split is development. Complete
all three runs and compare `summary.exact_answer_warehouse.rate` with `255/279`.
Bounded case selections, limited fallback and offline replays do not satisfy the
full live baseline prerequisite. Provider stops remain incomplete evidence.

AG07 remains `verification_blocked` until that quality prerequisite is met or the
owner explicitly accepts the gap. This continuation records no such acceptance.
AG08 remains `planned`: the live holdout, three owner examples, measured README
update and acceptance checks follow AG07. Holdout inference was not performed;
no cleanup, application changes or acceptance claims occurred. Direct NBA source
admission remains a separate source/consent gate.
