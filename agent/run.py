import argparse
import os
import shutil
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

from rich.console import Console
console = Console()

from config import MODEL_ID, estimate_cost
from graph import build_graph
from reporting import RunLog
from tools import output_lock

def main():
    parser = argparse.ArgumentParser(description="Autonomous Frontend Code Generator")
    parser.add_argument("--spec", default="spec.txt", help="Path to input text spec")
    parser.add_argument("--boilerplate", default="..", help="Path to starter boilerplate")
    parser.add_argument("--output", default="../generated-app", help="Output directory")
    args = parser.parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        console.print("[red]Error: ANTHROPIC_API_KEY not set in environment or .env[/red]")
        return

    src = Path(args.boilerplate).resolve()
    dst = Path(args.output).resolve()

    if dst == src or dst == Path.cwd().resolve():
        raise SystemExit(f"refusing to delete {dst}")

    # Claimed before the log is opened, so a run that is refused for holding no
    # claim on the directory does not leave an empty log behind.
    with output_lock(dst):
        log = RunLog(
            console,
            Path(__file__).parent / "logs",
            {
                "model": MODEL_ID,
                "spec": str(Path(args.spec).resolve()),
                "output": str(dst),
            },
        )
        try:
            log.section("Agentic Code Generation Pipeline")
            _generate(args, src, dst, log)
        finally:
            log.close()


def _generate(args, src: Path, dst: Path, log) -> None:
    if dst.exists():
        shutil.rmtree(dst)

    shutil.copytree(
        src, dst,
        ignore=shutil.ignore_patterns(
            "node_modules", ".git", "agent", dst.name, "dist", ".env",
            # Repo-level files that are not part of the app being generated.
            "Makefile", "docs", "README.md", "CHALLENGE.md", ".gitignore",
        ),
    )
    log.event(f"[green]OK[/green] Boilerplate prepared in [bold]{args.output}[/bold]")

    app = build_graph()
    initial_state = {
        "spec": Path(args.spec).read_text(encoding="utf-8"),
        "target_dir": str(dst),
        "boilerplate_context": "",
        "plan": [],
        "feature_order": [],
        "current_task_index": 0,
        "validation_output": None,
        "is_passing": False,
        "retries": 0,
        "max_retries": 3,
        "input_tokens": 0,
        "output_tokens": 0,
        "generated_files": {},
        "installed": False,
        "last_patched_file": None,
        "last_failure_signature": None,
        "unhelpful_fixes": [],
        "red_checked": False,
        "red_is_failing": False,
        "red_output": None,
    }

    _stream_run(app, initial_state, log, args.output)


def _next_label(node_name, plan, idx, red_checked) -> str:
    """What the agent is about to do next.

    `app.stream` only yields once a node has finished, so the label must
    describe the step ahead rather than the one just completed.
    """
    if node_name == "validator":
        return "Diagnosing the failure and patching the file it names"
    if node_name == "fixer":
        return "Re-running typecheck and tests"
    if node_name == "inspector":
        return "Planning: decomposing the spec into ordered tasks"
    if idx >= len(plan):
        return "Installing dependencies, then typecheck and tests (~1 min)"
    task = plan[idx]
    if not red_checked and task.phase == "implementation":
        return "Red phase: proving the tests fail before any code satisfies them"
    return f"Writing {task.filepath} ({idx + 1}/{len(plan)})"


def _stream_run(app, initial_state, log, output: str) -> bool:
    """Drive the graph, reporting each node as it lands. Returns pass/fail."""
    usage = {"input_tokens": 0, "output_tokens": 0}
    seen = dict(usage)
    plan: list = []
    idx = 0
    red_checked = False
    passing = False

    with console.status("[bold]Reading the boilerplate contracts", spinner="dots") as status:
        for event in app.stream(initial_state):
            for node_name, state_update in event.items():
                for key in usage:
                    if key in state_update:
                        usage[key] = state_update[key]
                step_in = usage["input_tokens"] - seen["input_tokens"]
                step_out = usage["output_tokens"] - seen["output_tokens"]
                seen = dict(usage)
                spend = (
                    f" [dim]({step_in:,} in / {step_out:,} out)[/dim]"
                    if step_in or step_out
                    else ""
                )

                if node_name == "planner":
                    plan = state_update["plan"]
                    log.event(f"[cyan]Plan created[/cyan] {len(plan)} tasks{spend}")
                    log.plan(plan, state_update.get("feature_order", []))
                elif node_name == "coder":
                    idx = state_update["current_task_index"]
                    task = plan[idx - 1]
                    log.event(
                        f"[yellow]Wrote[/yellow] {task.filepath} "
                        f"[dim]({task.phase} · {task.feature})[/dim]{spend}"
                    )
                elif node_name == "red_check":
                    red_checked = True
                    if state_update["red_is_failing"]:
                        log.event("[blue]Red phase[/blue] Tests fail before implementation, as expected.")
                    else:
                        log.event(
                            "[bold yellow]Red phase[/bold yellow] Tests PASSED with no "
                            "implementation — they assert nothing useful."
                        )
                elif node_name == "validator":
                    passing = state_update["is_passing"]
                    status_text = "[green]PASSED[/green]" if passing else "[red]FAILED[/red]"
                    log.event(f"[magenta]Validation[/magenta] Typecheck & tests: {status_text}")
                elif node_name == "fixer":
                    target = state_update.get("last_patched_file")
                    detail = f"patched [bold]{target}[/bold]" if target else "[red]no file patched[/red]"
                    log.event(f"[red]Fixer[/red] Self-healing: {detail}{spend}")

                status.update(f"[bold]{_next_label(node_name, plan, idx, red_checked)}")

    log.section("Execution Complete")
    cost = estimate_cost(usage["input_tokens"], usage["output_tokens"])
    log.note(f"Validation: {'[green]passing[/green]' if passing else '[red]failing[/red]'}")
    log.note(
        f"Tokens ({MODEL_ID}): "
        f"[bold]{usage['input_tokens']:,}[/bold] in, "
        f"[bold]{usage['output_tokens']:,}[/bold] out"
    )
    log.note(f"Estimated cost: [bold]${cost:.2f}[/bold]")
    log.note(f"Run output: [bold]{output}[/bold]")
    log.note("To run the generated app:")
    log.note(f"  cd {output} && npm install && npm run dev")
    log.note(f"Run log: [bold]{log.path}[/bold]")
    return passing


if __name__ == "__main__":
    main()
