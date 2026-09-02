import argparse
import os
import shutil
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

from rich.console import Console
console = Console()

from graph import build_graph

def main():
    parser = argparse.ArgumentParser(description="Autonomous Frontend Code Generator")
    parser.add_argument("--spec", default="spec.txt", help="Path to input text spec")
    parser.add_argument("--boilerplate", default="../boilerplate", help="Path to starter boilerplate")
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
        "total_tokens": 0
    }

    # Run state machine
    for event in app.stream(initial_state):
        for node_name, state_update in event.items():
            if node_name == "planner":
                console.print(f"[cyan][Plan Created][/cyan] {len(state_update['plan'])} tasks defined.")
            elif node_name == "coder":
                console.print(f"[yellow][Code Gen][/yellow] Completed task {state_update['current_task_index']}")
            elif node_name == "validator":
                status = "[green]PASSED[/green]" if state_update["is_passing"] else "[red]FAILED[/red]"
                console.print(f"[magenta][Validation][/magenta] Typecheck & Tests: {status}")
            elif node_name == "fixer":
                console.print("[red][Fixer][/red] Attempting self-healing patch...")

    console.rule("[bold green]Execution Complete[/bold green]")
    console.print(f"Run output located at: [bold]{args.output}[/bold]")
    console.print("To run the generated app:")
    console.print(f"  cd {args.output} && npm install && npm run dev")

if __name__ == "__main__":
    main()
