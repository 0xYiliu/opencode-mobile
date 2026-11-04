#!/usr/bin/env python3
"""Compare two extracted closure trees without following symlinks.

The closure verifier already has a byte-level diff, but diff -r is deliberately
not a contract for filesystem shape. This checker makes the contract explicit:
relative paths, entry type, effective mode, file bytes, and symlink targets all
must agree. A repository checkout can acquire the group-write bit from its
umask, so the normal mode policy ignores only that bit while retaining all
owner/other and executable-bit checks. --strict-mode is used by the disposable
negative tests when an exact filesystem-mode comparison is wanted.
"""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
from pathlib import PurePosixPath
import stat
import sys


ARTIFACT_DEFAULTS = ("node_modules", "dist", ".vite", ".turbo")


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_record(path: Path) -> tuple[str, int, int, str, str]:
    """Return type, raw mode, byte count, digest and link target."""

    st = path.lstat()
    mode = stat.S_IMODE(st.st_mode)
    if stat.S_ISDIR(st.st_mode):
        return "dir", mode, 0, "", ""
    if stat.S_ISREG(st.st_mode):
        hasher = hashlib.sha256()
        size = 0
        with path.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                hasher.update(chunk)
                size += len(chunk)
        return "file", mode, size, hasher.hexdigest(), ""
    if stat.S_ISLNK(st.st_mode):
        target = os.readlink(path)
        target_bytes = target.encode("utf-8", "surrogateescape")
        return "symlink", mode, len(target_bytes), digest_bytes(target_bytes), target
    return f"special:{stat.filemode(st.st_mode)}", mode, st.st_size, "", ""


def canonical_relative_path(value: str) -> str:
    parsed = PurePosixPath(value)
    if (
        not value
        or "\\" in value
        or parsed.is_absolute()
        or parsed.as_posix() != value
        or any(part in ("", ".", "..") for part in value.split("/"))
    ):
        raise argparse.ArgumentTypeError(f"exclude path must be canonical relative POSIX text: {value!r}")
    return value


def excluded(relative: str, names: set[str], paths: set[str]) -> bool:
    if not relative:
        return False
    if names.intersection(Path(relative).parts):
        return True
    return any(relative == path or relative.startswith(f"{path}/") for path in paths)


def snapshot(root: Path, excluded_names: set[str], excluded_paths: set[str]) -> dict[str, tuple[str, int, int, str, str]]:
    result: dict[str, tuple[str, int, int, str, str]] = {}

    if not root.exists() and not root.is_symlink():
        return result

    def visit(path: Path, relative: str) -> None:
        if excluded(relative, excluded_names, excluded_paths):
            return
        result[relative] = file_record(path)
        if result[relative][0] != "dir":
            return
        for child in sorted(path.iterdir(), key=lambda entry: entry.name):
            child_relative = f"{relative}/{child.name}" if relative else child.name
            visit(child, child_relative)

    visit(root, "")
    return result


def mode_for_compare(mode: int, strict: bool) -> int:
    # The source tree is routinely extracted under umask 0002 while an
    # unchanged checkout may retain 0644. Group-write is not a Git mode bit
    # and is the only environment-derived bit tolerated by the default check.
    return mode if strict else mode & ~0o020


def format_record(record: tuple[str, int, int, str, str]) -> str:
    typ, mode, size, digest, target = record
    suffix = f" target={target!r}" if typ == "symlink" else ""
    return f"type={typ} mode={mode:04o} bytes={size} sha256={digest}{suffix}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected", required=True, type=Path)
    parser.add_argument("--actual", required=True, type=Path)
    parser.add_argument("--exclude-name", action="append", default=list(ARTIFACT_DEFAULTS))
    parser.add_argument("--exclude-path", action="append", default=[], type=canonical_relative_path)
    parser.add_argument("--strict-mode", action="store_true")
    parser.add_argument("--label", default="closure")
    args = parser.parse_args()

    expected_exists = args.expected.exists() or args.expected.is_symlink()
    actual_exists = args.actual.exists() or args.actual.is_symlink()
    if not expected_exists or not actual_exists:
        print(
            f"{args.label}: FAIL root expected_exists={expected_exists} actual_exists={actual_exists}",
        )
        return 1

    expected = snapshot(args.expected, set(args.exclude_name), set(args.exclude_path))
    actual = snapshot(args.actual, set(args.exclude_name), set(args.exclude_path))
    mismatches: list[str] = []

    for relative in sorted(set(expected) | set(actual)):
        if relative not in expected:
            mismatches.append(f"ADDED path={relative!r} actual={format_record(actual[relative])}")
            continue
        if relative not in actual:
            mismatches.append(f"DELETED path={relative!r} expected={format_record(expected[relative])}")
            continue

        expected_record = expected[relative]
        actual_record = actual[relative]
        expected_type, expected_mode, expected_size, expected_digest, expected_target = expected_record
        actual_type, actual_mode, actual_size, actual_digest, actual_target = actual_record
        if expected_type != actual_type:
            mismatches.append(
                f"TYPE path={relative!r} expected={expected_type} actual={actual_type}"
            )
            continue
        if mode_for_compare(expected_mode, args.strict_mode) != mode_for_compare(actual_mode, args.strict_mode):
            mismatches.append(
                f"MODE path={relative!r} expected={expected_mode:04o} actual={actual_mode:04o}"
            )
        if expected_type == "file":
            if expected_size != actual_size or expected_digest != actual_digest:
                mismatches.append(
                    f"BYTES path={relative!r} expected={format_record(expected_record)} "
                    f"actual={format_record(actual_record)}"
                )
        elif expected_type == "symlink" and expected_target != actual_target:
            mismatches.append(
                f"SYMLINK path={relative!r} expected_target={expected_target!r} "
                f"actual_target={actual_target!r}"
            )

    if mismatches:
        print(
            f"{args.label}: FAIL entries_expected={len(expected)} entries_actual={len(actual)} "
            f"mismatches={len(mismatches)}"
        )
        for mismatch in mismatches:
            print(f"  {mismatch}")
        return 1

    policy = "strict" if args.strict_mode else "repo-mode(group-write-tolerated)"
    print(f"{args.label}: PASS entries={len(expected)} mode-policy={policy}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
