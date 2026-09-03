"""Run logging.

The property worth protecting is that the log is on disk *as it happens* — the
run most worth having a log for is the one that never reaches the end.
"""

import io

from rich.console import Console

from reporting import RunLog, _plain


def _log(tmp_path):
    console = Console(file=io.StringIO(), width=100)
    return RunLog(console, tmp_path / "logs", {"model": "test-model", "spec": "spec.txt"})


class TestPlain:
    def test_strips_markup(self):
        assert _plain("[green]OK[/green] done") == "OK done"

    def test_survives_text_that_is_not_valid_markup(self):
        """A malformed style must never take the file copy down with it."""
        assert "Plan Created" in _plain("[Plan Created] 12 tasks")


class TestRunLog:
    def test_header_records_the_run_parameters(self, tmp_path):
        log = _log(tmp_path)
        log.close()
        assert "test-model" in log.path.read_text()

    def test_events_are_on_disk_before_the_run_ends(self, tmp_path):
        """No close(), no flush() — this is the crash-safety guarantee."""
        log = _log(tmp_path)
        log.event("[yellow]Wrote[/yellow] src/a.ts")
        assert "Wrote src/a.ts" in log.path.read_text()

    def test_events_are_timestamped_and_unstyled_in_the_file(self, tmp_path):
        log = _log(tmp_path)
        log.event("[red]Fixer[/red] patched src/a.ts")
        line = [l for l in log.path.read_text().splitlines() if "Fixer" in l][0]
        assert line.startswith("[") and "[red]" not in line

    def test_console_and_file_both_receive_the_event(self, tmp_path):
        console = Console(file=io.StringIO(), width=100)
        log = RunLog(console, tmp_path / "logs", {})
        log.event("Validation PASSED")
        assert "Validation PASSED" in console.file.getvalue()
        assert "Validation PASSED" in log.path.read_text()

    def test_plan_groups_by_feature_and_numbers_by_execution(self, tmp_path, task):
        """Steps run phase-major, so numbers within a feature are deliberately
        out of order — that is the point of showing both."""
        tasks = [
            task(filepath="a.test.ts", phase="test", feature="Listing"),
            task(filepath="b.test.ts", phase="test", feature="Search"),
            task(filepath="a.ts", phase="implementation", feature="Listing"),
        ]
        log = _log(tmp_path)
        log.plan(tasks, ["Listing", "Search"])
        body = log.path.read_text()
        assert body.index("Listing") < body.index("Search")
        assert "1. a.test.ts" in body and "3. a.ts" in body

    def test_plan_still_renders_a_feature_missing_from_the_order(self, tmp_path, task):
        log = _log(tmp_path)
        log.plan([task(filepath="x.ts", feature="Unlisted")], [])
        assert "Unlisted" in log.path.read_text()

    def test_descriptions_reach_the_file_but_not_the_console(self, tmp_path, task):
        """The file is the artifact; the console has to stay scannable."""
        console = Console(file=io.StringIO(), width=100)
        log = RunLog(console, tmp_path / "logs", {})
        t = task(filepath="a.ts")
        t.description = "Exports useCars returning cars, loading, error"
        log.plan([t], ["Listing"])
        assert "Exports useCars" in log.path.read_text()
        assert "Exports useCars" not in console.file.getvalue()
