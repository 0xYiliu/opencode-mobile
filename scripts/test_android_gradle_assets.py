#!/usr/bin/env python3
"""Isolated Gradle integration: valid payload succeeds, damaged payload blocks mergeDebugAssets."""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('assets_module', root / 'scripts/android_web_assets.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
gradle = os.environ.get('GRADLE', 'gradle')
with tempfile.TemporaryDirectory(prefix='opencode-gradle-assets-') as tmp:
    base = Path(tmp)
    shutil.copytree(root / 'android', base / 'android', ignore=shutil.ignore_patterns('build', '.gradle', '.kotlin', 'web'))
    (base / 'scripts').mkdir()
    shutil.copy2(root / 'scripts/android_web_assets.py', base / 'scripts/android_web_assets.py')
    source = base / 'fixture'
    source.mkdir()
    html = b'<html><head></head><body>fixture</body></html>'
    revision, integrity = module.digests(html)
    (source / 'index.html').write_bytes(html)
    (source / 'sw.js').write_text(f'precache([{{url:"index.html",revision:"{revision}",integrity:"{integrity}"}}])')
    assets = base / 'android/app/src/main/assets/web'
    module.stage_and_publish(source, assets, base / 'web-dist/manifest.json')
    command = [gradle, ':app:mergeDebugAssets', '--console=plain']
    good = subprocess.run(command, cwd=base / 'android', text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if good.returncode != 0 or 'android web assets: verified' not in good.stdout:
        raise SystemExit('valid fixture failed:\n' + good.stdout)
    index = assets / 'index.html'
    index.write_bytes(index.read_bytes().replace(module.MARKER, b''))
    bad = subprocess.run(command, cwd=base / 'android', text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if bad.returncode == 0 or ':app:verifyAndroidWebAssets FAILED' not in bad.stdout:
        raise SystemExit('damaged fixture was not blocked:\n' + bad.stdout)
    print('Gradle: valid assets merge; damaged marker/manifest blocked before merge')
