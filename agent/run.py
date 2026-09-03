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

def main():
    parser = argparse.ArgumentParser(description="Autonomous Frontend Code Generator")
    parser.add_argument("--spec", default="spec.txt", help="Path to input text spec")
    parser.add_argument("--boilerplate", default="..", help="Path to starter boilerplate")
    parser.add_argument("--output", default="./generated-app", help="Output directory")
    args = parser.parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        console.print("[red]Error: ANTHROPIC_API_KEY not set in environment or .env[/red]")
        return

    console.rule("[bold blue]Agentic Code Generation Pipeline[/bold blue]")
    
    # 1. Clone boilerplate into target output
    src = Path(args.boilerplate).resolve()
    dst = Path(args.output).resolve()

    if dst == src or dst == Path.cwd().resolve():
        raise SystemExit(f"refusing to delete {dst}")

    if dst.exists():
        shutil.rmtree(dst)
    
    shutil.copytree(
        src, dst,
        ignore=shutil.ignore_patterns(
            "node_modules", ".git", "agent", dst.name, "dist", ".env",
        ),
    )
    console.print(f"[green]✓[/green] Boilerplate prepared in [bold]{args.output}[/bold]")

    spec_text = Path(args.spec).read_text(encoding="utf-8")
    
    app = build_graph()
    initial_state = {
        "spec": spec_text,
        "target_dir": str(Path(args.output).resolve()),
        "boilerplate_context": "",
        "plan": [],
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
        "red_checked": False,
        "red_is_failing": False,
        "red_output": None
    }

    # Run state machine. Nodes return running totals, so the last value seen for
    # each is the total for the run.
    usage = {"input_tokens": 0, "output_tokens": 0}
    passing = False

    for event in app.stream(initial_state):
        for node_name, state_update in event.items():
            for key in usage:
                if key in state_update:
                    usage[key] = state_update[key]

            if node_name == "planner":
                console.print(f"[cyan][Plan Created][/cyan] {len(state_update['plan'])} tasks defined.")
            elif node_name == "coder":
                console.print(f"[yellow][Code Gen][/yellow] Completed task {state_update['current_task_index']}")
            elif node_name == "red_check":
                if state_update["red_is_failing"]:
                    console.print("[blue][Red Phase][/blue] Tests fail before implementation, as expected.")
                else:
                    console.print("[bold yellow][Red Phase][/bold yellow] Tests PASSED with no implementation — they assert nothing useful.")
            elif node_name == "validator":
                passing = state_update["is_passing"]
                status = "[green]PASSED[/green]" if passing else "[red]FAILED[/red]"
                console.print(f"[magenta][Validation][/magenta] Typecheck & Tests: {status}")
            elif node_name == "fixer":
                target = state_update.get("last_patched_file")
                detail = f"patched [bold]{target}[/bold]" if target else "[red]no file patched[/red]"
                console.print(f"[red][Fixer][/red] Self-healing: {detail}")

    console.rule("[bold green]Execution Complete[/bold green]")

    cost = estimate_cost(usage["input_tokens"], usage["output_tokens"])
    console.print(f"Validation: {'[green]passing[/green]' if passing else '[red]failing[/red]'}")
    console.print(
        f"Tokens ({MODEL_ID}): "
        f"[bold]{usage['input_tokens']:,}[/bold] in, "
        f"[bold]{usage['output_tokens']:,}[/bold] out"
    )
    console.print(f"Estimated cost: [bold]${cost:.2f}[/bold]")
    console.print(f"Run output located at: [bold]{args.output}[/bold]")
    console.print("To run the generated app:")
    console.print(f"  cd {args.output} && npm install && npm run dev")

if __name__ == "__main__":
    main()
