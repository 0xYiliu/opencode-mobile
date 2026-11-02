#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('assets_module', Path(__file__).with_name('android_web_assets.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class WebAssetsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='opencode-assets-test-')
        self.root = Path(self.tmp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.assets = self.root / 'assets' / 'web'
        self.manifest = self.root / 'manifest.json'
        index = b'<html><head></head><body>app</body></html>'
        revision, integrity = module.digests(index)
        (self.source / 'index.html').write_bytes(index)
        (self.source / 'sw.js').write_text(f'precache([{{url:"index.html",revision:"{revision}",integrity:"{integrity}"}}])')
        module.stage_and_publish(self.source, self.assets, self.manifest)

    def tearDown(self):
        self.tmp.cleanup()

    def test_success_and_invalid_source_preserve_previous_payload(self):
        before = (self.assets / 'index.html').read_bytes(), self.manifest.read_bytes()
        (self.source / 'sw.js').write_text('invalid')
        with self.assertRaises(ValueError):
            module.stage_and_publish(self.source, self.assets, self.manifest)
        self.assertEqual(before, ((self.assets / 'index.html').read_bytes(), self.manifest.read_bytes()))
        module.verify(self.assets, json.loads(self.manifest.read_text()))

    def test_untracked_user_file_is_preserved_in_backup(self):
        user = self.assets / 'user-file'
        user.write_text('preserve')
        module.stage_and_publish(self.source, self.assets, self.manifest)
        backups = list(self.assets.parent.parent.glob('.web-stage-*/old/user-file'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), 'preserve')
        module.verify(self.assets, json.loads(self.manifest.read_text()))

    def test_old_assets_with_new_or_missing_manifest_migrate_without_loss(self):
        old = self.assets / 'index.html'
        old.write_text('older checkout asset')
        self.manifest.write_text('{"new_checkout": true}')
        module.stage_and_publish(self.source, self.assets, self.manifest)
        backups = list(self.assets.parent.parent.glob('.web-stage-*/old/index.html'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), 'older checkout asset')
        self.assertEqual(backups[0].parents[1].joinpath('old-manifest.json').read_text(), '{"new_checkout": true}')
        module.verify(self.assets, json.loads(self.manifest.read_text()))
        self.manifest.unlink()
        module.stage_and_publish(self.source, self.assets, self.manifest)
        self.assertEqual(len(list(self.assets.parent.parent.glob('.web-stage-*/old/index.html'))), 2)
        module.verify(self.assets, json.loads(self.manifest.read_text()))

    def test_source_symlink_cannot_redirect_staging_writes(self):
        outside = self.root / 'outside'
        outside.write_text('preserve')
        (self.source / 'sw.js').unlink()
        (self.source / 'sw.js').symlink_to(outside)
        with self.assertRaises(ValueError):
            module.stage_and_publish(self.source, self.assets, self.manifest)
        self.assertEqual(outside.read_text(), 'preserve')
        module.verify(self.assets, json.loads(self.manifest.read_text()))

    def test_publish_failure_restores_old_assets_and_manifest(self):
        before = (self.assets / 'index.html').read_bytes(), self.manifest.read_bytes()
        with patch.object(module.os, 'replace', side_effect=OSError('simulated publication failure')):
            with self.assertRaises(OSError):
                module.stage_and_publish(self.source, self.assets, self.manifest)
        self.assertEqual(before, ((self.assets / 'index.html').read_bytes(), self.manifest.read_bytes()))
        module.verify(self.assets, json.loads(self.manifest.read_text()))

    def test_failed_rollback_retains_backup_for_recovery(self):
        before = (self.assets / 'index.html').read_bytes()
        real_rename = module.os.rename
        def rename(source, target):
            if Path(source).name == 'old':
                raise OSError('simulated rollback failure')
            return real_rename(source, target)
        with patch.object(module.os, 'replace', side_effect=OSError('simulated publication failure')):
            with patch.object(module.os, 'rename', side_effect=rename):
                with self.assertRaises(OSError):
                    module.stage_and_publish(self.source, self.assets, self.manifest)
        backups = list(self.assets.parent.parent.glob('.web-stage-*/old/index.html'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), before)

    def test_manifest_cannot_hide_corrupt_worker_or_marker(self):
        worker = self.assets / 'sw.js'
        worker.write_text(worker.read_text().replace('sha256-', 'sha256-X', 1))
        with self.assertRaises(ValueError):
            module.verify(self.assets, module.manifest_for(self.assets))
        # Separately remove the marker and refresh the manifest: marker check must still fail.
        html = self.assets / 'index.html'
        html.write_bytes(html.read_bytes().replace(module.MARKER, b''))
        with self.assertRaises(ValueError):
            module.verify(self.assets, module.manifest_for(self.assets))


if __name__ == '__main__':
    unittest.main()
