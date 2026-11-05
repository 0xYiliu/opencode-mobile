#!/usr/bin/env python3
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).with_name("mobile-patches.py")
spec = importlib.util.spec_from_file_location("mobile_patches", SCRIPT)
patches = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patches)


class MobilePatchesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="mobile-patches-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.vendor = self.root / "vendor/upstream"
        self.mobile = self.vendor / "patches/mobile"
        self.mobile.mkdir(parents=True)
        self.entries = []
        # Independent changes can coexist without an Issue ID or global number.
        for identity in ("connection-vault-ready", "session-agent-selector"):
            body = (f"diff --git a/{identity} b/{identity}\nnew file mode 100644\n"
                    f"--- /dev/null\n+++ b/{identity}\n@@ -0,0 +1 @@\n+{identity}\n").encode()
            path = f"patches/mobile/{identity}.patch"
            (self.vendor / path).write_bytes(body)
            self.entries.append(dict(id=identity, patch=path, status="active",
                                     sha256=hashlib.sha256(body).hexdigest(), reason="preserve me"))
        self.order = [e["patch"] for e in self.entries]
        self.write_fixture()
        patches.check(self.vendor, refresh=True)

    def write(self, path, data):
        path.write_text(json.dumps(data, indent=2) + "\n")

    def write_fixture(self):
        self.write(self.mobile / "manifest.json", {"version": 1, "patches": self.entries})
        self.write(self.vendor / "vendor-manifest.json", {"mobilePatches": self.order, "upstream": {"pin": "untouched"}})
        self.write(self.vendor / "provenance.json", {"historical": {"sha256": "do not rewrite"}})

    def test_parallel_patches_replay_in_either_explicit_order(self):
        for order in (self.order, list(reversed(self.order))):
            self.order = order
            self.write_fixture()
            patches.check(self.vendor, refresh=True)
            patches.check(self.vendor)
            with tempfile.TemporaryDirectory(dir=self.root) as tree:
                for path in order:
                    subprocess.run(["git", "apply", str(self.vendor / path)], cwd=tree, check=True)
                for entry in self.entries:
                    self.assertEqual((Path(tree) / entry["id"]).read_text(), entry["id"] + "\n")

    def test_refresh_is_explicit_idempotent_and_preserves_history(self):
        (self.vendor / self.order[0]).write_bytes(b"changed patch bytes\n")
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            patches.check(self.vendor)
        patches.check(self.vendor, refresh=True)
        self.assertEqual(patches.check(self.vendor, refresh=True)[1], [])
        self.assertEqual(patches.read_json(self.vendor / "vendor-manifest.json")["mobilePatches"], self.order)
        self.assertEqual(patches.read_json(self.vendor / "provenance.json")["historical"]["sha256"], "do not rewrite")
        self.assertEqual(patches.read_json(self.mobile / "manifest.json")["patches"][0]["reason"], "preserve me")
        patches.check(self.vendor)

    def test_structural_errors_fail_before_refresh_writes(self):
        original = copy.deepcopy(self.entries)
        cases = {
            "duplicate ID": lambda e: e[1].update(id=e[0]["id"]),
            "duplicate patch path": lambda e: e[1].update(patch=e[0]["patch"]),
            "invalid patch path": lambda e: e[0].update(patch="patches/mobile/../escape.patch"),
            "active/order mismatch": lambda e: e[0].update(status="deferred"),
            "unknown/self dependency": lambda e: e[0].update(dependsOn=["missing"]),
            "dependency must be active and earlier": lambda e: e[0].update(dependsOn=[e[1]["id"]]),
            "duplicate dependency": lambda e: e[1].update(dependsOn=[e[0]["id"], e[0]["id"]]),
        }
        for message, mutate in cases.items():
            with self.subTest(message=message):
                self.entries = copy.deepcopy(original)
                mutate(self.entries)
                self.write_fixture()
                before = {p: p.read_bytes() for p in self.vendor.rglob("*.json")}
                with self.assertRaisesRegex(ValueError, message):
                    patches.check(self.vendor, refresh=True)
                self.assertEqual(before, {p: p.read_bytes() for p in before})

    def test_missing_symlink_and_unregistered_patch_rejected(self):
        file = self.vendor / self.order[0]
        body = file.read_bytes()
        file.unlink()
        with self.assertRaisesRegex(ValueError, "missing or symlink"):
            patches.check(self.vendor)
        file.symlink_to(self.vendor / self.order[1])
        with self.assertRaisesRegex(ValueError, "missing or symlink"):
            patches.check(self.vendor)
        file.unlink()
        file.write_bytes(body)
        (self.mobile / "unregistered.patch").write_text("unregistered")
        with self.assertRaisesRegex(ValueError, "unregistered patch"):
            patches.check(self.vendor)

    def test_order_and_mirror_drift_rejected(self):
        path = self.vendor / "vendor-manifest.json"
        data = patches.read_json(path)
        data["mobilePatches"].append(self.order[0])
        self.write(path, data)
        with self.assertRaisesRegex(ValueError, "duplicate mobilePatches"):
            patches.check(self.vendor)
        data["mobilePatches"].pop()
        data["mobilePatchRegistry"][0]["sha256"] = "stale"
        self.write(path, data)
        with self.assertRaisesRegex(ValueError, "stale generated field"):
            patches.check(self.vendor)

    def test_deferred_dependency_and_cycle(self):
        self.entries[1]["dependsOn"] = [self.entries[0]["id"]]
        self.write_fixture()
        patches.check(self.vendor, refresh=True)
        for e in self.entries:
            e["status"] = "deferred"
        self.order = []
        self.write_fixture()
        patches.check(self.vendor, refresh=True)
        self.assertEqual(len(patches.read_json(self.vendor / "provenance.json")["deferredMobilePatches"]), 2)
        self.entries[0]["dependsOn"] = [self.entries[1]["id"]]
        self.write_fixture()
        with self.assertRaisesRegex(ValueError, "dependency cycle"):
            patches.check(self.vendor, refresh=True)

    def test_sync_rejects_invalid_registry_before_deleting_sources(self):
        scripts = self.root / "scripts"
        scripts.mkdir()
        for name in ("vendor-sync.sh", "mobile-patches.py"):
            shutil.copyfile(SCRIPT.with_name(name), scripts / name)
        cache = self.root / "cache"
        (cache / ".git").mkdir(parents=True)
        sentinel = self.vendor / "packages/user-work"
        sentinel.parent.mkdir()
        sentinel.write_text("preserve")
        self.entries[1]["id"] = self.entries[0]["id"]
        self.write_fixture()
        result = subprocess.run(["bash", str(scripts / "vendor-sync.sh")], cwd=self.root,
                                env={**os.environ, "OPENCODE_UPSTREAM_CACHE": str(cache)},
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("duplicate ID", result.stderr)
        self.assertEqual(sentinel.read_text(), "preserve")

    def test_full_closure_rejects_package_and_license_mode_changes(self):
        cache = self.root / "upstream"
        (cache / "packages/app").mkdir(parents=True)
        (cache / "packages/app/package.json").write_text('{"name":"@opencode/app"}\n')
        (cache / "LICENSE").write_text("fixture license\n")
        subprocess.run(["git", "init", "-q", str(cache)], check=True)
        subprocess.run(["git", "-C", str(cache), "add", "."], check=True)
        subprocess.run(["git", "-C", str(cache), "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                        "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"], check=True)
        pin = subprocess.check_output(["git", "-C", str(cache), "rev-parse", "HEAD"], text=True).strip()
        for file in self.mobile.glob("*.patch"):
            file.unlink()
        self.write(self.mobile / "manifest.json", {"patches": []})
        self.write(self.vendor / "vendor-manifest.json", {
            "upstream": {"pin": pin}, "packages": ["app"], "topLevelFiles": ["LICENSE"], "mobilePatches": []})
        patches.check(self.vendor, refresh=True)
        shutil.copytree(cache / "packages", self.vendor / "packages")
        shutil.copy2(cache / "LICENSE", self.vendor / "LICENSE")
        scripts = self.root / "scripts"
        scripts.mkdir()
        for name in ("verify-closure.sh", "mobile-patches.py"):
            shutil.copyfile(SCRIPT.with_name(name), scripts / name)

        def run():
            return subprocess.run(["bash", str(scripts / "verify-closure.sh")], cwd=self.root,
                                  env={**os.environ, "OPENCODE_UPSTREAM_CACHE": str(cache), "TMPDIR": str(self.root)},
                                  capture_output=True, text=True)

        result = run()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for name in ("packages/app/package.json", "LICENSE"):
            with self.subTest(path=name):
                file = self.vendor / name
                mode = file.stat().st_mode & 0o777
                try:
                    file.chmod(mode ^ 0o100)
                    result = run()
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("file types/executable bits/symlinks differ", result.stdout)
                    self.assertIn(name, result.stdout)
                finally:
                    file.chmod(mode)


if __name__ == "__main__":
    unittest.main()
