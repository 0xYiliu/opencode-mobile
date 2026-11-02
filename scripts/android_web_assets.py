#!/usr/bin/env python3
"""Stage and verify Android WebView assets without touching unverified existing files."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
MARKER = b'<meta name="opencode-mobile-host" content="android-v1">'
PATTERN = re.compile(r'(\{url:"index\.html",revision:")([0-9a-f]+)(",integrity:")([^\"]+)("\})')


def digests(data):
    return hashlib.md5(data).hexdigest(), 'sha256-' + base64.b64encode(hashlib.sha256(data).digest()).decode()


def scan(directory):
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError('asset directory missing or symlink')
    files = {}
    size = 0
    for path in sorted(directory.rglob('*')):
        if path.is_symlink():
            raise ValueError(f'symlink is not allowed: {path}')
        if path.is_dir():
            if not any(path.iterdir()):
                raise ValueError(f'empty directory is not tracked by manifest: {path}')
            continue
        if not path.is_file():
            raise ValueError(f'unsupported file type: {path}')
        data = path.read_bytes()
        files[path.relative_to(directory).as_posix()] = hashlib.sha256(data).hexdigest()
        size += len(data)
    return files, size


def manifest_for(directory):
    files, size = scan(directory)
    return {'generatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'source': 'vendor/upstream/packages/app/dist (Android index.html and Workbox integrity adapted)',
            'copiedTo': 'android/app/src/main/assets/web/', 'fileCount': len(files), 'totalBytes': size, 'files': files}


def verify(directory, manifest, require_marker=True):
    expected_keys = {'generatedAt', 'source', 'copiedTo', 'fileCount', 'totalBytes', 'files'}
    if not isinstance(manifest, dict) or set(manifest) != expected_keys:
        raise ValueError('manifest has missing or unrecognized metadata; refusing replacement')
    if manifest.get('source') not in {'vendor/upstream/packages/app/dist', 'vendor/upstream/packages/app/dist (Android index.html and Workbox integrity adapted)'} or manifest.get('copiedTo') != 'android/app/src/main/assets/web/':
        raise ValueError('manifest does not identify the generated Android payload')
    files, size = scan(directory)
    if files != manifest.get('files') or len(files) != manifest.get('fileCount') or size != manifest.get('totalBytes'):
        raise ValueError('asset files, hashes, count or total size do not match manifest')
    if not require_marker:
        return
    index = (directory / 'index.html').read_bytes()
    if index.count(MARKER) != 1 or index.count(b'opencode-mobile-host') != 1 or index.count(b'<head>' + MARKER) != 1 or index.find(MARKER) > index.find(b'</head>'):
        raise ValueError('Android HTML marker is missing, duplicated or outside head')
    worker = (directory / 'sw.js').read_text(encoding='utf-8')
    matches = list(PATTERN.finditer(worker))
    revision, integrity = digests(index)
    if len(matches) != 1 or matches[0].group(2) != revision or matches[0].group(4) != integrity:
        raise ValueError('Workbox index revision or SHA-256 integrity does not match Android HTML')


def transform(stage):
    index = stage / 'index.html'
    worker = stage / 'sw.js'
    original = index.read_bytes()
    if original.count(b'<head>') != 1 or b'opencode-mobile-host' in original:
        raise ValueError('invalid index marker anchor')
    source = worker.read_text(encoding='utf-8')
    matches = list(PATTERN.finditer(source))
    if len(matches) != 1 or (matches[0].group(2), matches[0].group(4)) != digests(original):
        raise ValueError('original Workbox index revision or integrity is incorrect')
    marked = original.replace(b'<head>', b'<head>' + MARKER, 1)
    revision, integrity = digests(marked)
    match = matches[0]
    replacement = match.group(1) + revision + match.group(3) + integrity + match.group(5)
    worker.write_text(source[:match.start()] + replacement + source[match.end():], encoding='utf-8')
    index.write_bytes(marked)


def stage_and_publish(source, assets, manifest_path):
    if source.is_symlink() or not source.is_dir():
        raise ValueError('source directory missing or symlink')
    assets.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    if manifest_path.is_symlink() or (manifest_path.exists() and not manifest_path.is_file()):
        raise ValueError('manifest is not a regular file; refusing replacement')
    # Prior ignored assets may belong to a different checkout or contain user files.
    # Preserve the entire tree rather than relying on the current tracked manifest.
    had_assets = assets.exists() or assets.is_symlink()
    if had_assets and (assets.is_symlink() or not assets.is_dir()):
        raise ValueError('existing asset path is not a real directory; refusing replacement')
    # Keep backups outside Android's assets source tree, on the same filesystem
    # so renaming the existing directory remains atomic.
    backup_parent = assets.parent.parent
    if os.stat(backup_parent).st_dev != os.stat(assets.parent).st_dev:
        raise ValueError('backup directory is not on the assets filesystem')
    temporary = Path(tempfile.mkdtemp(prefix='.web-stage-', dir=backup_parent))
    backup = temporary / 'old'
    published = False
    try:
        stage = temporary / 'new'
        shutil.copytree(source, stage, symlinks=True)
        # Check before transforming, otherwise a copied symlink could redirect writes outside the staging tree.
        scan(stage)
        transform(stage)
        manifest = manifest_for(stage)
        verify(stage, manifest)
        # Preserve the previous tracked manifest as well; it may be from a newer checkout.
        if manifest_path.is_file():
            shutil.copy2(manifest_path, temporary / 'old-manifest.json')
        # Same-filesystem temporary manifest is atomically installed after the directory.
        fd, temp_name = tempfile.mkstemp(prefix='.manifest-', dir=manifest_path.parent)
        manifest_tmp = Path(temp_name)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as output:
                json.dump(manifest, output, indent=2, sort_keys=True)
                output.write('\n')
            if had_assets:
                os.rename(assets, backup)
            try:
                os.rename(stage, assets)
                os.replace(manifest_tmp, manifest_path)
                published = True
            except BaseException:
                if assets.exists():
                    os.rename(assets, stage)
                if had_assets:
                    os.rename(backup, assets)
                raise
        finally:
            manifest_tmp.unlink(missing_ok=True)
    finally:
        # Never remove prior data, even on successful migration or failed rollback.
        if (backup.exists() or backup.is_symlink()) or (published and (temporary / 'old-manifest.json').exists()):
            print(f'android web assets: previous files retained at {temporary}', file=sys.stderr)
        else:
            shutil.rmtree(temporary)
    print(f"copy-web-dist: {manifest['fileCount']} files, {manifest['totalBytes']} bytes (verified)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['stage', 'verify'])
    parser.add_argument('--source', type=Path, default=ROOT / 'vendor/upstream/packages/app/dist')
    parser.add_argument('--assets', type=Path, default=ROOT / 'android/app/src/main/assets/web')
    parser.add_argument('--manifest', type=Path, default=ROOT / 'web-dist/manifest.json')
    args = parser.parse_args()
    try:
        if args.action == 'stage':
            stage_and_publish(args.source, args.assets, args.manifest)
        else:
            verify(args.assets, json.loads(args.manifest.read_text()))
            print('android web assets: verified')
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        parser.exit(1, f'android web assets: {error}\n')


if __name__ == '__main__':
    main()
