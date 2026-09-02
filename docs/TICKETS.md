# TICKETS.md — Stage Board

Work is planned as stages before it is built. Each stage is one ticket with explicit
acceptance criteria, and lands as its own commit or small set of commits.

**Status legend:** `TODO` · `IN PROGRESS` · `DONE`

---

## Process note — read this first

Commit `8ac8db2` landed six files (`state.py`, `tools.py`, `nodes.py`, `graph.py`,
`run.py`, `spec.txt`) in a single commit — the entire pipeline at once. That commit hides
how the pipeline actually came together, and rewriting history to pretend otherwise would
be worse than owning it. From Stage 0 onward the rule is **one ticket, one commit**,
recorded here rather than left as tribal knowledge.

---

## Completed before the board existed

| Commit | What landed |
|---|---|
| `bdbf78f` | Boilerplate initial commit — React 19 + Apollo + MUI + MSW + Vitest |
| `8f22150` | `agent/` scaffolded with uv; dependencies added |
| `8ac8db2` | Full five-node pipeline: `state.py`, `tools.py`, `nodes.py`, `graph.py`, `run.py`, `spec.txt` |

The skeleton exists and is wired. Every stage below modifies it; none recreates it.

---

## Stage 0 — Baseline and doc bootstrap · `DONE`

Prove the baseline is clean, create the working docs, clear dead weight.

**Acceptance criteria**

- [x] `npm install`, `npm run test`, `npm run typecheck` all pass at the repo root
      (2 tests pass; `tsc --noEmit` clean)
- [x] `docs/PROJECT.md` exists, populated only from facts observable in the repo
- [x] `docs/TICKETS.md` exists — this board, with status traceable to git log or source
- [x] `agent/main.py` deleted (unused `uv init` stub printing "Hello from agent!")
- [x] `agent/README.md` written — what the agent is, plus the `uv run` command
- [x] `run.py --boilerplate` default corrected from `../boilerplate` (does not exist)
      to `..` — the repo root, relative to `agent/`, which is where the CLI is run from

**Commits:** `docs: add PROJECT.md and TICKETS.md` · `chore: remove unused stub, document agent, fix boilerplate path default`

---

## Stage 1 — Make the planner spec-driven · `DONE`

The agent must work on any spec, not just the one it was developed against.

**Acceptance criteria**

- [x] Planner prompt carries **structural** guidance only — data/schema first, then hooks,
      then UI components, then entry-point integration, then tests. No domain nouns.
- [x] `agent/spec.txt` expanded to product-owner prose covering the full reference app
      (list via GraphQL, responsive images at ≤640 / 641–1023 / ≥1024, MUI cards, Add Car
      mutation form, search by model, sort by year and make, `useCars()` hook, unit tests).
      Written as prose, **not** as a pre-decomposed task list.
- [x] Model ID moved to a config constant read from env (`ANTHROPIC_MODEL`, default
      `claude-opus-5`)
- [x] Planner run against a throwaway unrelated spec produces a substantively different
      plan, and neither plan mentions cars unless its spec does

**Commit:** `feat(planner): make planning fully spec-driven, expand sample spec`

---

## Stage 2 — Cross-file correctness · `TODO`

Stop the coder from being blind to its own output.

**Acceptance criteria**

- [ ] `generated_files: dict[str, str]` added to `AgentState`, initialized in `run.py`
- [ ] Manifest of prior generated files injected into the coder prompt on every call
- [ ] `coder_node` returns the updated manifest alongside the incremented index
- [ ] One short few-shot example in the coder prompt showing the expected shape of a
      custom hook
- [ ] A generated component's imports match the actual exports of the hook it imports

**Commit:** `feat(coder): add generated-file manifest and few-shot example for cross-file context`

---

## Stage 3 — Validation and self-healing · `TODO`

Make the retry loop actually work.

**Acceptance criteria**

- [ ] `run_npm_install(target_dir)` added to `tools.py`, called from `validator_node`
      before typecheck and tests
- [ ] Success cached via an `installed: bool` flag in state so retries don't reinstall
- [ ] `FixResult` Pydantic model (`filepath`, `corrected_content`); `fixer_node` uses
      `with_structured_output` instead of hand-splitting on markers
- [ ] Failure localized before fixing — `src/...` paths regexed out of validator
      stdout/stderr, those files read, their content passed to the fixer
- [ ] With a file deliberately broken: validator fails on real npm output, and the fixer
      targets the correct path rather than guessing

**Commit:** `feat(validator): install deps before checks; add structured fixer with error localization`

---

## Stage 4 — End-to-end and generalization · `TODO`

Prove it works end to end, prove it generalizes, and measure what a run actually costs.

**Acceptance criteria**

- [ ] Full run against the real `spec.txt` completes; everything it surfaces is fixed
- [ ] `input_tokens` and `output_tokens` tracked separately in state (from LangChain's
      `usage_metadata`); totals and estimated cost printed at end of run
- [ ] `spec-alt.md` written describing a variation, and a run against it produces output
      that reflects the changed spec
- [ ] Both runs' token counts and costs recorded in `docs/PROJECT.md`
- [ ] `cd generated-app && npm install && npm run typecheck && npm run test && npm run dev`
      all succeed

**Commits:** `fix: resolve issues found in first full end-to-end run` · `feat(cli): report input/output tokens and estimated cost per run` · `test: confirm generalization against a modified spec`

---

## Stage 5 — Write-up · `TODO`

`docs/WRITEUP.md`, distilled from `docs/PROJECT.md` — the short version, for someone
deciding whether to read the source.

**Acceptance criteria**

- [ ] Which model, and the reasoning behind choosing it
- [ ] Agent architecture, with a diagram
- [ ] Measured cost per run, from real token counts (Stage 4), not an estimate
- [ ] What worked well and what would improve with more time
- [ ] The known limitation stated plainly: no final cross-file consistency pass
- [ ] Someone who has never seen the repo can set it up from the write-up alone

**Commit:** `docs: add write-up with architecture, cost, and known limitations`
