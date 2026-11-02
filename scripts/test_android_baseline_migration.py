#!/usr/bin/env python3
"""Real baseline rebuild migration: pass the extracted/built c50dbba checkout directory."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parent.parent
if len(sys.argv) != 2:
    raise SystemExit('usage: python3 scripts/test_android_baseline_migration.py <built-c50dbba-directory>')
baseline = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location('assets_module', root / 'scripts/android_web_assets.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
old_assets = baseline / 'android/app/src/main/assets/web'
old_manifest = json.loads((baseline / 'baseline-generated-manifest.json').read_text())
module.verify(old_assets, old_manifest, require_marker=False)
recorded = json.loads(subprocess.check_output(['git', 'show', 'c50dbba:web-dist/manifest.json'], cwd=root, text=True))
if old_manifest['fileCount'] != recorded['fileCount'] or old_manifest['totalBytes'] != recorded['totalBytes']:
    raise SystemExit('baseline file count or size differs from c50dbba record')
differences = {p for p in recorded['files'].keys() | old_manifest['files'].keys() if recorded['files'].get(p) != old_manifest['files'].get(p)}
if any(not p.endswith('.map') for p in differences):
    raise SystemExit('baseline differs from c50dbba outside path-dependent sourcemaps')
with tempfile.TemporaryDirectory(prefix='opencode-baseline-migration-', dir='/tmp/opencode') as tmp:
    base = Path(tmp)
    assets = base / 'android/app/src/main/assets/web'
    assets.parent.mkdir(parents=True)
    shutil.copytree(old_assets, assets)
    (assets / 'user-owned-test.txt').write_text('preserve-synthetic-user-file')
    manifest = base / 'web-dist/manifest.json'
    manifest.parent.mkdir()
    shutil.copy2(root / 'web-dist/manifest.json', manifest)
    module.stage_and_publish(root / 'vendor/upstream/packages/app/dist', assets, manifest)
    module.verify(assets, json.loads(manifest.read_text()))
    backups = list(assets.parent.parent.glob('.web-stage-*/old'))
    if len(backups) != 1:
        raise SystemExit('expected exactly one preserved baseline')
    saved = backups[0]
    if (saved / 'user-owned-test.txt').read_text() != 'preserve-synthetic-user-file':
        raise SystemExit('synthetic user file was not preserved')
    (saved / 'user-owned-test.txt').unlink()
    module.verify(saved, old_manifest, require_marker=False)
    print(f'baseline migration: {old_manifest["fileCount"]} old files preserved; new assets verified; {len(differences)} path-dependent maps differ from recorded baseline')
