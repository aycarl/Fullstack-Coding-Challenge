import subprocess
from pathlib import Path


def resolve_project_path(target_dir: str, rel_path: str) -> Path | None:
    """Resolve rel_path inside target_dir, or None if it escapes.

    The fixer chooses this path itself, so it is untrusted input: an absolute
    path or one containing .. must not be able to write outside the run.
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
    """Install dependencies into the output directory.

    Without this the checks below run against a tree with no node_modules. That
    happens to work while the output sits inside a repo that has its own
    (npm walks parent directories for .bin), and breaks the moment it does not.
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
    # 1. Check TypeScript compilation
    tc = subprocess.run(
        ["npm", "run", "typecheck"],
        cwd=target_dir,
        capture_output=True,
        text=True
    )
    if tc.returncode != 0:
        return False, f"TypeScript Typecheck Failed:\n{tc.stdout}\n{tc.stderr}"

    # 2. Run Vitest in single-run mode
    test = subprocess.run(
        ["npm", "run", "test", "--", "--run"],
        cwd=target_dir,
        capture_output=True,
        text=True
    )
    if test.returncode != 0:
        return False, f"Vitest Suite Failed:\n{test.stdout}\n{test.stderr}"

    return True, "All type checks and tests passed cleanly."
