from pathlib import Path
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
import re

from config import MODEL_ID
from state import AgentState, AgentPlan, FixResult
from tools import (
    read_project_file,
    resolve_project_path,
    run_npm_install,
    run_validation_suite,
    write_project_file,
)

llm = ChatAnthropic(model_name=MODEL_ID)


# Files the planner and coder need in full to honour the boilerplate's contracts.
CONTRACT_FILES = [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "vitest.config.ts",
    "src/types.ts",
    "src/graphql/client.ts",
    "src/graphql/queries.ts",
    "src/mocks/handlers.ts",
    "src/test-setup.ts",
    "src/main.tsx",
    "src/App.tsx",
    # Worked references. Without them the coder invents its own test harness:
    # one run stood up a real ApolloClient over jsdom fetch and broke on it.
    "src/components/Example.tsx",
    "src/__tests__/Example.test.tsx",
]

# Never part of the boilerplate contract, and expensive to walk.
IGNORED_DIRS = {"node_modules", ".git", "dist", ".vite", "coverage", "docs"}


PHASE_ORDER = {"scaffold": 0, "test": 1, "implementation": 2}


def _usage(message) -> tuple[int, int]:
    """Input and output tokens for one call; the two are priced differently."""
    meta = getattr(message, "usage_metadata", None) or {}
    return meta.get("input_tokens", 0), meta.get("output_tokens", 0)


def inspector_node(state: AgentState) -> dict:
    target = Path(state["target_dir"])

    manifest = []
    for path in sorted(target.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(target)
        if any(part in IGNORED_DIRS for part in rel.parts):
            continue
        manifest.append(str(rel))

    context_chunks = [
        "The project below already exists and is fully wired. Every path in this "
        "manifest is present before generation starts: reuse these files and the "
        "symbols they already export instead of recreating equivalents at new "
        "paths, and do not rewrite the build, mocking or entry-point wiring "
        "unless the specification actually requires a change to it.",
        "--- Existing files ---\n" + "\n".join(manifest),
    ]

    for rel_path in CONTRACT_FILES:
        f = target / rel_path
        if f.exists():
            context_chunks.append(
                f"--- File: {rel_path} ---\n{f.read_text(encoding='utf-8')}"
            )

    return {"boilerplate_context": "\n\n".join(context_chunks)}


def planner_node(state: AgentState) -> dict:
    structured_llm = llm.with_structured_output(
        AgentPlan, method="json_schema", include_raw=True
    )
    prompt = f"""You are a principal frontend architect planning an implementation.

Boilerplate the generated code must fit into:
{state['boilerplate_context']}

Product specification:
{state['spec']}

Decompose this specification into an ordered list of file-level tasks. Every
requirement stated in the specification must be covered by at least one task,
and no task may introduce a requirement the specification does not state.

Plan the work test-first: the tests for a behaviour are written before the code
that satisfies it, and must fail until that code exists.

Order the tasks in three phases, tagging each task with its `phase`:

1. `scaffold` — only contracts the tests need that do not already exist. If the
   boilerplate already defines a type, query or mutation, the tests import it as
   it stands; do not restate, re-document or re-export it. Most specifications
   need no scaffold task at all.
2. `test` — a test for every behaviour the specification calls for, written
   against code that does not exist yet. Assert observable behaviour taken from
   the specification, never the internals of an implementation you have in mind.
   Each test task must state the import path and the exported names and
   signatures it expects, because those become the contract the implementation
   is written to satisfy.
3. `implementation` — the code that makes those tests pass, leaf modules before
   the modules that compose them, finishing with integration into the
   application entry point.

Label every task with the `feature` it serves: the user-facing capability from
the specification that this file exists to deliver, named as a product owner would
say it ("Car listing", "Search", "Add car form"), never as a layer ("hooks",
"components", "tests"). Every task serving one capability carries the same label,
so the plan reads as an ordered sequence of features even though each task builds
one file. Introduce the features in the order a reader should meet them: the
capability everything else depends on first.

Each task covers exactly one file. Reuse the boilerplate's existing paths, import
aliases and conventions, and prefer extending an existing file over creating a
parallel one beside it. In each task description, state the exported API of that
file — the names and signatures other files will import — so that later tasks can
depend on it correctly.

Emit a task only for a file you will substantively change. Every task rewrites the
file it names in full, so a task that concludes "leave this as-is" destroys working
code. If an existing file already satisfies the specification, leave it out of the
plan entirely — never add a task to verify, confirm or re-check one. For the same
reason, leave existing passing tests and example files alone unless the
specification changes the behaviour they cover.

Output ONLY the structured plan."""

    result = structured_llm.invoke([HumanMessage(content=prompt)])
    plan_result = result["parsed"]
    if plan_result is None:
        raise RuntimeError(f"planner returned no usable plan: {result['parsing_error']}")

    # A blank label would render as a nameless feature of its own.
    for task in plan_result.tasks:
        task.feature = task.feature.strip() or "General"

    # Captured before the sort below scatters each feature across the phases.
    feature_order = list(dict.fromkeys(t.feature for t in plan_result.tasks))

    # Sort rather than trust: a test emitted after its implementation is not
    # test-first. The sort is stable, so order within a phase is preserved.
    tasks = sorted(plan_result.tasks, key=lambda t: PHASE_ORDER.get(t.phase, 2))

    in_tok, out_tok = _usage(result["raw"])
    return {
        "plan": tasks,
        "feature_order": feature_order,
        "current_task_index": 0,
        "input_tokens": state["input_tokens"] + in_tok,
        "output_tokens": state["output_tokens"] + out_tok,
    }


# Deliberately in a domain the specification will never use, so it teaches shape
# without seeding vocabulary.
HOOK_EXAMPLE = """// Example of the expected shape only. Not part of the app being built.
import { useQuery } from "@apollo/client";
import { GET_ITEMS } from "@/graphql/queries";
import type { Item } from "@/types";

export interface UseItemsResult {
  items: Item[];
  loading: boolean;
  error?: Error;
}

export function useItems(): UseItemsResult {
  const { data, loading, error } = useQuery<{ items: Item[] }>(GET_ITEMS);
  return { items: data?.items ?? [], loading, error };
}
"""


def _render_generated_files(generated: dict[str, str]) -> str:
    """Render every file written so far this run.

    Injecting all of them is a deliberate simplification that grows
    quadratically; it is affordable only at a dozen small files.
    """
    if not generated:
        return "Nothing has been generated yet; this is the first file."
    return "\n\n".join(
        f"--- File: {path} ---\n{content}" for path, content in generated.items()
    )


def coder_node(state: AgentState) -> dict:
    idx = state["current_task_index"]
    task = state["plan"][idx]

    existing_content = read_project_file(state["target_dir"], task.filepath)
    generated = state["generated_files"]

    if task.phase == "test":
        phase_guidance = (
            "This is a test, and the code it exercises does not exist yet. It is "
            "expected to fail when run — that is the point. Write it against the "
            "behaviour the specification describes, and be precise about the import "
            "path and the exported names and signatures you expect, because the "
            "implementation will be written to match this file. Do not write a test "
            "that would pass against missing code.\n\n"
            "The mock data seeded by the boilerplate is shown above. Any fixture "
            "standing for a record the test itself creates must differ from every "
            "seeded record in the fields the test queries on, or the assertion "
            "cannot tell the new record from the seeded one and will match both."
        )
    elif task.phase == "implementation":
        phase_guidance = (
            "The tests shown above are already written and are the specification for "
            "this file. Conform to the import paths, exported names, prop shapes and "
            "signatures they expect, and make them pass. Do not modify them."
        )
    else:
        phase_guidance = (
            "This is a shared contract that later tests will import. Define types and "
            "API documents only; implement no behaviour here."
        )

    prompt = f"""You are generating application code for: {task.filepath}
Task purpose: {task.description}
Phase: {task.phase}. {phase_guidance}

Pre-existing project context:
{state['boilerplate_context']}

Files already generated during this run:
{_render_generated_files(generated)}

Existing content of the file you are writing (if any):
{existing_content}

{HOOK_EXAMPLE}

Write the full, complete production code for this file.

Import only symbols that actually exist. The files above are the real source of
truth for what is importable: match each import to the way that file actually
exports it — a default export must be imported as a default, a named export by
name — and match prop and return types to the signatures those files declare.
Do not import from a path that is not listed above.

Return ONLY the raw code for the file, with no markdown code fences and no prose."""

    response = llm.invoke(
        [
            SystemMessage(
                content="You are an expert React 19 + TypeScript + Apollo Client developer."
            ),
            HumanMessage(content=prompt),
        ]
    )

    clean_code = response.text.strip()
    if clean_code.startswith("```"):
        clean_code = "\n".join(clean_code.split("\n")[1:-1])

    write_project_file(state["target_dir"], task.filepath, clean_code)

    in_tok, out_tok = _usage(response)
    return {
        "current_task_index": idx + 1,
        "input_tokens": state["input_tokens"] + in_tok,
        "output_tokens": state["output_tokens"] + out_tok,
        "generated_files": {**generated, task.filepath: clean_code},
    }


def red_check_node(state: AgentState) -> dict:
    """Run the suite once the tests exist but before any code satisfies them.

    Tests that pass here assert nothing, which is worth surfacing now rather
    than when everything is green for the wrong reason.
    """
    target_dir = state["target_dir"]
    updates: dict = {"red_checked": True}

    if not state["installed"]:
        installed, output = run_npm_install(target_dir)
        if not installed:
            return {**updates, "red_is_failing": True, "red_output": output}
        updates["installed"] = True

    passed, output = run_validation_suite(target_dir)
    return {**updates, "red_is_failing": not passed, "red_output": output}


def validator_node(state: AgentState) -> dict:
    # Install once; the retry loop reuses it rather than reinstalling each cycle.
    if not state["installed"]:
        installed, output = run_npm_install(state["target_dir"])
        if not installed:
            return {
                "is_passing": False,
                "validation_output": output,
                "retries": state["retries"] + 1,
                "installed": False,
            }

    passed, output = run_validation_suite(state["target_dir"])
    return {
        "is_passing": passed,
        "validation_output": output,
        "retries": state["retries"] + (0 if passed else 1),
        "installed": True,
    }


# Paths as tsc and vitest report them, e.g. "src/components/CarCard.tsx(9,57)".
ERROR_PATH_RE = re.compile(r"((?:src|tests)/[\w./-]+\.(?:tsx?|jsx?))")

# Bound the prompt: a cascade of errors must not open the whole tree.
MAX_IMPLICATED_FILES = 6


def _implicated_files(validation_output: str, target_dir: str) -> dict[str, str]:
    """Read the files the validator actually named, in order of first mention."""
    found: dict[str, str] = {}
    for rel_path in ERROR_PATH_RE.findall(validation_output):
        if rel_path in found or len(found) >= MAX_IMPLICATED_FILES:
            continue
        content = read_project_file(target_dir, rel_path)
        if not content.startswith("File not found:"):
            found[rel_path] = content
    return found


def fixer_node(state: AgentState) -> dict:
    target_dir = state["target_dir"]
    implicated = _implicated_files(state["validation_output"], target_dir)

    if implicated:
        files_block = "\n\n".join(
            f"--- File: {path} ---\n{content}" for path, content in implicated.items()
        )
        scope = (
            "Rewrite exactly one of the files listed above. Its `filepath` must be "
            "one of: " + ", ".join(implicated)
        )
    else:
        files_block = "No source file could be identified from the error output."
        scope = "Name the relative path of the file that must change."

    structured_llm = llm.with_structured_output(
        FixResult, method="json_schema", include_raw=True
    )
    prompt = f"""Validation of the generated project failed.

Validator output:
{state['validation_output']}

Current contents of the files named in that output:
{files_block}

Diagnose the root cause and return the complete corrected contents of the single
file that needs to change. {scope}

Preserve everything that is already correct — return the whole file, not a
fragment, and do not rewrite working code beyond what the error requires.

The tests were written before the code, deliberately, and they encode the
specification. Prefer correcting the implementation over changing a test. Only
change a test when it contradicts the specification, cannot compile, or cannot
discriminate — an assertion matching several elements when it means to identify one
is a defective assertion, not a genuine failure being hidden, and correcting it is
the right fix. Never weaken an assertion that is failing for a real reason."""

    raw_result = structured_llm.invoke(
        [
            SystemMessage(
                content="You fix TypeScript and Vitest errors with precision."
            ),
            HumanMessage(content=prompt),
        ]
    )
    fix = raw_result["parsed"]
    in_tok, out_tok = _usage(raw_result["raw"])

    patched = None
    if fix is not None and resolve_project_path(target_dir, fix.filepath) is not None:
        write_project_file(target_dir, fix.filepath, fix.corrected_content)
        patched = fix.filepath

    return {
        "input_tokens": state["input_tokens"] + in_tok,
        "output_tokens": state["output_tokens"] + out_tok,
        "last_patched_file": patched,
    }
