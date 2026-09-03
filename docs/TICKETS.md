# Implementation Process

Work was planned as stages with acceptance criteria before it was built, and each stage
landed as its own focused commit. This is the record of how the agent came together.

---

### Stage 0 — Baseline and docs · `2b5da77` `4a3d889`

- Verified the boilerplate green before touching anything.
- Created this board and `PROJECT.md` as the working source of truth.
- Removed the `uv init` stub; fixed `--boilerplate` defaulting to a path that didn't exist.

### Stage 1 — Spec-driven planner · `d134717` `4e02b65` `bb71140` `9e06a47`

- Stripped every car-specific noun from the planner prompt — structural guidance only.
- Expanded `spec.txt` into product-owner prose rather than a pre-decomposed task list.
- Moved the model id to one env-overridable constant.
- Gave the planner the boilerplate's full file manifest. Cut a 22-task plan that rebuilt
  the Apollo client, MSW mocks and Vite config down to 13 touching no boilerplate at all.

### Stage 2 — Cross-file correctness · `29c83f7` `8054a79`

- Carried every generated file in state and injected it into each coder call, so imports
  are checked against real exports instead of guessed.
- Added one few-shot hook example, in a domain no spec will use.

### Stage 3 — Validation and self-healing · `e33ec1d`

- Installed dependencies before validating — a fresh output tree has no `node_modules`.
- Moved the fixer to structured output. The old marker-parsing branch wasn't just fragile;
  under adaptive thinking it never fired, so the fixer had silently written nothing.
- Localised failures: regex `src/…` paths out of the validator output, read those files,
  hand them to the fixer instead of letting it infer a filename.

### Stage 4 — End-to-end and generalization · `f484f47` `de5e263` `c81c741` `cf2731e`

- Retried only transient API faults; LangGraph's default retries any exception, turning a
  real bug into five slow identical failures.
- Made planning test-first and added `red_check` to prove the tests fail before any code.
- Tracked input and output tokens separately and reported cost per run.
- Ran an unrelated spec (`spec-alt.md`) to prove generalization. Both specs finish 68/68.

### Stage 4.5 — Legible decomposition · `c37c6f4` `a84f9e1` `cff7c6a` `cf2731e`

- Labelled each task with the capability it serves; execution order unchanged.
- Streamed a run log to stdout and `agent/logs/`, flushed per event so a crashed run still
  leaves a record. Per-task token deltas made the context cost measurable.
- Fixed two defects a run exposed: fixture data colliding with the seeded mocks, and the
  fixer refusing to repair a genuinely ambiguous assertion.

### Stage 5 — Write-up · `6615b19`

- Distilled [`WRITEUP.md`](WRITEUP.md) from `PROJECT.md`.

---

### Process note

Commit `8ac8db2` landed the entire five-node pipeline in one commit, before this board
existed. It hides how the pipeline actually came together. Rewriting history to pretend
otherwise would be worse, so it is recorded here instead — one ticket, one commit has
applied since.
