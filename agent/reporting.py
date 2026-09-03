"""Run logging: one stream of events, two destinations.

Everything the CLI prints is also appended to a timestamped file under
`agent/logs/`, flushed as it happens rather than assembled at the end — a run
that dies at task 9 should still leave a record of the first eight, which is
exactly the case where the log is worth having.

The console copy is styled and scannable; the file copy carries the full task
descriptions, so it stands alone as a record of what the agent decided to do.
"""

import re
from datetime import datetime
from pathlib import Path

from rich.text import Text

# Fallback for stripping console markup if Rich cannot parse a line. Rich is the
# authority here; this only exists so a malformed style can never take the file
# copy down with it.
_MARKUP_RE = re.compile(r"\[/?[a-z][a-z0-9 _#]*\]")

RULE_WIDTH = 78


def _plain(markup: str) -> str:
    """The text of a styled line, with the styling removed."""
    try:
        return Text.from_markup(markup).plain
    except Exception:
        return _MARKUP_RE.sub("", markup)


class RunLog:
    """Writes each event to the console and to a run log, in step."""

    def __init__(self, console, log_dir: Path, header: dict[str, str]):
        self.console = console
        log_dir.mkdir(parents=True, exist_ok=True)
        started = datetime.now()
        stamp = started.strftime("%Y%m%d-%H%M%S")
        self._path = log_dir / f"{stamp}_generated_logs.txt"
        self._handle = self._path.open("w", encoding="utf-8")

        self._write("Agentic Code Generation — run log")
        self._write("=" * RULE_WIDTH)
        self._write(f"{'started':<12} {started.isoformat(timespec='seconds')}")
        for key, value in header.items():
            self._write(f"{key:<12} {value}")
        self._write("=" * RULE_WIDTH)

    @property
    def path(self) -> Path:
        return self._path

    def _write(self, line: str = "") -> None:
        self._handle.write(line + "\n")
        self._handle.flush()

    def event(self, markup: str) -> None:
        """A timestamped event: styled to the console, plain to the file."""
        self.console.print(markup)
        self._write(f"[{datetime.now().strftime('%H:%M:%S')}] {_plain(markup)}")

    def section(self, title: str) -> None:
        self.console.rule(f"[bold blue]{title}[/bold blue]")
        self._write()
        self._write(f"--- {title} ".ljust(RULE_WIDTH, "-"))

    def note(self, markup: str) -> None:
        """An untimestamped line — headers, totals, closing detail."""
        self.console.print(markup)
        self._write(_plain(markup))

    def plan(self, tasks, feature_order) -> None:
        """Render the plan grouped by feature, numbered by execution order.

        Tasks execute phase-major (every test before any implementation), so the
        step numbers deliberately run out of order within a feature. That is the
        point: the reader sees both the feature the file serves and when it is
        actually built.
        """
        step = {id(task): i + 1 for i, task in enumerate(tasks)}
        # Any label the planner introduced after the run started, plus a guard
        # for a feature that somehow never made the order list.
        ordered = list(feature_order) + [
            t.feature for t in tasks if t.feature not in feature_order
        ]

        self.note(
            f"\n[bold]Plan:[/bold] {len(tasks)} tasks across "
            f"{len(dict.fromkeys(ordered))} features "
            f"[dim](numbered in execution order)[/dim]"
        )

        for feature in dict.fromkeys(ordered):
            members = [t for t in tasks if t.feature == feature]
            if not members:
                continue
            self.note(f"\n  [bold cyan]{feature}[/bold cyan]")
            for task in sorted(members, key=lambda t: step[id(t)]):
                self.note(
                    f"    [dim]{step[id(task)]:>2}.[/dim] {task.filepath} "
                    f"[dim]({task.phase})[/dim]"
                )
                # The description is the actual decomposition; it belongs in the
                # artifact even though it is too long for the console.
                self._write(f"        {task.description}")
        self.note("")

    def close(self) -> None:
        self._write()
        self._write(f"ended       {datetime.now().isoformat(timespec='seconds')}")
        self._handle.close()
