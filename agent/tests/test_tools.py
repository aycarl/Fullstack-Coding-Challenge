"""File I/O and the shell-out validators.

`resolve_project_path` is the security boundary: the fixer names its own write
target, so anything it can talk the model into must stay inside the run.
"""

import os
import subprocess

import pytest

import tools
from tools import (
    read_project_file,
    resolve_project_path,
    run_npm_install,
    run_validation_suite,
    write_project_file,
)


class TestResolveProjectPath:
    def test_allows_a_path_inside_the_project(self, tmp_path):
        resolved = resolve_project_path(str(tmp_path), "src/components/CarCard.tsx")
        assert resolved == tmp_path / "src/components/CarCard.tsx"

    @pytest.mark.parametrize("escape", [
        "../outside.ts",
        "../../etc/passwd",
        "src/../../outside.ts",
        "src/./../../outside.ts",
    ])
    def test_rejects_traversal(self, tmp_path, escape):
        assert resolve_project_path(str(tmp_path), escape) is None

    def test_rejects_an_absolute_path(self, tmp_path):
        assert resolve_project_path(str(tmp_path), "/etc/passwd") is None

    def test_rejects_the_project_root_itself(self, tmp_path):
        """Writing to the root would replace the directory with a file."""
        assert resolve_project_path(str(tmp_path), ".") is None

    def test_traversal_that_returns_inside_is_allowed(self, tmp_path):
        """Ugly but harmless — it resolves within the project."""
        assert resolve_project_path(str(tmp_path), "src/../src/x.ts") == tmp_path / "src/x.ts"


class TestReadWrite:
    def test_write_creates_missing_parent_directories(self, tmp_path):
        write_project_file(str(tmp_path), "src/hooks/useCars.ts", "export {};")
        assert (tmp_path / "src/hooks/useCars.ts").read_text() == "export {};"

    def test_round_trips(self, tmp_path):
        write_project_file(str(tmp_path), "src/a.ts", "const a = 1;")
        assert read_project_file(str(tmp_path), "src/a.ts") == "const a = 1;"

    def test_missing_file_reports_rather_than_raises(self, tmp_path):
        """The coder passes this straight into a prompt, so it must not raise."""
        assert read_project_file(str(tmp_path), "nope.ts").startswith("File not found:")


class TestValidationSuite:
    def _fake_run(self, results):
        calls = []
        def _run(cmd, cwd=None, capture_output=False, text=False):
            calls.append(cmd)
            code, out, err = results.pop(0)
            return subprocess.CompletedProcess(cmd, code, out, err)
        return _run, calls

    def test_typecheck_failure_short_circuits_before_tests(self, monkeypatch, tmp_path):
        """Running vitest against code that does not compile wastes a minute."""
        fake, calls = self._fake_run([(2, "TS2304: Cannot find name", "")])
        monkeypatch.setattr(subprocess, "run", fake)
        passed, output = run_validation_suite(str(tmp_path))
        assert passed is False
        assert "TS2304" in output
        assert len(calls) == 1

    def test_passing_runs_both_checks(self, monkeypatch, tmp_path):
        fake, calls = self._fake_run([(0, "", ""), (0, "68 passed", "")])
        monkeypatch.setattr(subprocess, "run", fake)
        passed, _ = run_validation_suite(str(tmp_path))
        assert passed is True
        assert len(calls) == 2

    def test_test_failure_surfaces_the_real_output(self, monkeypatch, tmp_path):
        """The fixer diagnoses from this text, so it must not be swallowed."""
        fake, _ = self._fake_run([(0, "", ""), (1, "FAIL src/__tests__/App.test.tsx", "")])
        monkeypatch.setattr(subprocess, "run", fake)
        passed, output = run_validation_suite(str(tmp_path))
        assert passed is False
        assert "src/__tests__/App.test.tsx" in output

    def test_install_failure_is_reported_not_raised(self, monkeypatch, tmp_path):
        fake, _ = self._fake_run([(1, "", "ENOENT")])
        monkeypatch.setattr(subprocess, "run", fake)
        ok, output = run_npm_install(str(tmp_path))
        assert ok is False
        assert "ENOENT" in output


class TestOutputLock:
    """Generation begins by deleting the target, so two runs must not overlap."""

    def test_creates_the_lock_beside_the_directory_not_inside_it(self, tmp_path):
        out = tmp_path / "generated-app"
        with tools.output_lock(out):
            assert (tmp_path / "generated-app.lock").exists()

    def test_releases_on_the_way_out(self, tmp_path):
        out = tmp_path / "generated-app"
        with tools.output_lock(out):
            pass
        assert not (tmp_path / "generated-app.lock").exists()

    def test_releases_even_when_the_run_raises(self, tmp_path):
        out = tmp_path / "generated-app"
        with pytest.raises(RuntimeError):
            with tools.output_lock(out):
                raise RuntimeError("run blew up")
        assert not (tmp_path / "generated-app.lock").exists()

    def test_refuses_to_start_while_a_live_run_holds_it(self, tmp_path):
        out = tmp_path / "generated-app"
        with tools.output_lock(out):
            with pytest.raises(SystemExit) as exc:
                with tools.output_lock(out):
                    pass
        assert "already writing" in str(exc.value)

    def test_reclaims_a_lock_left_by_a_dead_run(self, tmp_path):
        """A crashed run must not block every later run forever."""
        out = tmp_path / "generated-app"
        (tmp_path / "generated-app.lock").write_text("999999 2026-01-01T00:00:00\n")
        with tools.output_lock(out):
            assert (tmp_path / "generated-app.lock").read_text().split()[0] == str(os.getpid())

    def test_reclaims_a_corrupt_lock(self, tmp_path):
        out = tmp_path / "generated-app"
        (tmp_path / "generated-app.lock").write_text("not-a-pid")
        with tools.output_lock(out):
            assert (tmp_path / "generated-app.lock").exists()
