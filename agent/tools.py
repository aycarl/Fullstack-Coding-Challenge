import os
import subprocess
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path


def _holder_is_running(pid: int) -> bool:
    """Whether the process that wrote a lock still exists."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


@contextmanager
def output_lock(output_dir: Path):
    """Hold exclusive claim on an output directory for the length of a run.

    Generation starts by deleting the target, so two concurrent runs silently
    destroy each other's work — one collision cost a run mid-validation. The
    lock sits beside the directory rather than inside it, because the directory
    itself is about to be removed. A lock left behind by a crashed run is
    reclaimed rather than blocking every later run forever.
    """
    lock = output_dir.with_name(output_dir.name + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)

    for reclaimed in (False, True):
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            try:
                holder = int(lock.read_text().split()[0])
            except (OSError, ValueError, IndexError):
                holder = None
            if holder is not None and _holder_is_running(holder):
                raise SystemExit(
                    f"another run (pid {holder}) is already writing to {output_dir}.\n"
                    f"Wait for it to finish, or delete {lock} if you know it is stale."
                )
            if reclaimed:
                raise SystemExit(f"could not acquire {lock}")
            lock.unlink(missing_ok=True)

    os.write(fd, f"{os.getpid()} {datetime.now().isoformat(timespec='seconds')}\n".encode())
    os.close(fd)
    try:
        yield
    finally:
        lock.unlink(missing_ok=True)


def resolve_project_path(target_dir: str, rel_path: str) -> Path | None:
    """Resolve rel_path inside target_dir, or None if it escapes.

    The fixer chooses this path itself, so it is untrusted input.
    """
    root = Path(target_dir).resolve()
    candidate = (root / rel_path).resolve()
    if candidate == root or root not in candidate.parents:
        return None
    return candidate

def write_project_file(target_dir: str, rel_path: str, content: str) -> str:
    full_path = Path(target_dir) / rel_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(content, encoding="utf-8")
    return f"Wrote {rel_path}"

def read_project_file(target_dir: str, rel_path: str) -> str:
    full_path = Path(target_dir) / rel_path
    if not full_path.exists():
        return f"File not found: {rel_path}"
    return full_path.read_text(encoding="utf-8")

def run_npm_install(target_dir: str) -> tuple[bool, str]:
    """Install dependencies before the checks.

    A freshly copied output tree has no node_modules of its own.
    """
    proc = subprocess.run(
        ["npm", "install"],
        cwd=target_dir,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return False, f"npm install failed:\n{proc.stdout}\n{proc.stderr}"
    return True, "Dependencies installed."


def run_validation_suite(target_dir: str) -> tuple[bool, str]:
    tc = subprocess.run(
        ["npm", "run", "typecheck"],
        cwd=target_dir,
        capture_output=True,
        text=True
    )
    if tc.returncode != 0:
        return False, f"TypeScript Typecheck Failed:\n{tc.stdout}\n{tc.stderr}"

    test = subprocess.run(
        ["npm", "run", "test", "--", "--run"],
        cwd=target_dir,
        capture_output=True,
        text=True
    )
    if test.returncode != 0:
        return False, f"Vitest Suite Failed:\n{test.stdout}\n{test.stderr}"

    return True, "All type checks and tests passed cleanly."
