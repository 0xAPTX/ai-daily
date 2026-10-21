import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from save_history import run_git, save_history


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.remote = self.root / 'remote.git'
        self.worker = self.root / 'worker'
        self.writer = self.root / 'writer'
        run_git(['init', '--bare', '--initial-branch=main', str(self.remote)], self.root)
        run_git(['clone', str(self.remote), str(self.worker)], self.root)
        self.configure(self.worker)
        for name in ['site/index.html', 'site/data/feed.json', 'site/feed.xml',
                     'site/sources.opml', 'x-watchlist.json', 'imports/0xaptx-following.json',
                     'README.md']:
            self.write(self.worker, name, 'initial\n')
        run_git(['add', '.'], self.worker)
        run_git(['commit', '-m', 'Initial source and data'], self.worker)
        run_git(['push', 'origin', 'main'], self.worker)
        run_git(['clone', str(self.remote), str(self.writer)], self.root)
        self.configure(self.writer)
        self.base = self.head(self.worker)

    def configure(self, root):
        run_git(['config', 'user.name', 'History Test'], root)
        run_git(['config', 'user.email', 'history@example.invalid'], root)
        run_git(['config', 'commit.gpgsign', 'false'], root)

    def write(self, root, name, value):
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value)

    def head(self, root):
        return run_git(['rev-parse', 'HEAD'], root).stdout.strip()

    def advance_remote(self):
        self.write(self.writer, 'README.md', 'new source documentation\n')
        run_git(['add', 'README.md'], self.writer)
        run_git(['commit', '-m', 'Concurrent source update'], self.writer)
        run_git(['push', 'origin', 'main'], self.writer)
        return self.head(self.writer)

    def test_generated_changes_are_committed_and_pushed(self):
        self.write(self.worker, 'site/data/feed.json', 'fresh data\n')
        result = save_history(self.worker)
        self.assertTrue(result['publish'])
        self.assertNotEqual(result['commit'], self.base)
        self.assertEqual(self.head(self.remote), result['commit'])
        self.assertEqual(run_git(['show', 'HEAD:site/data/feed.json'], self.remote).stdout, 'fresh data\n')

    def test_unchanged_history_can_publish_without_a_commit(self):
        result = save_history(self.worker)
        self.assertTrue(result['publish'])
        self.assertEqual(result['commit'], self.base)

    def test_old_checkout_skips_before_committing(self):
        newer = self.advance_remote()
        self.write(self.worker, 'site/data/feed.json', 'stale generated data\n')
        result = save_history(self.worker)
        self.assertFalse(result['publish'])
        self.assertEqual(self.head(self.worker), self.base)
        self.assertEqual(self.head(self.remote), newer)

    def test_remote_advance_during_push_preserves_new_source(self):
        self.write(self.worker, 'site/data/feed.json', 'generated data\n')

        def racing_git(args, root, check=True):
            if args[0] == 'push':
                self.advance_remote()
            return run_git(args, root, check)

        result = save_history(self.worker, git=racing_git)
        self.assertFalse(result['publish'])
        self.assertEqual(self.head(self.remote), self.head(self.writer))
        self.assertEqual(run_git(['show', 'HEAD:README.md'], self.remote).stdout, 'new source documentation\n')
        self.assertEqual(run_git(['show', 'HEAD:site/data/feed.json'], self.remote).stdout, 'initial\n')

    def test_real_push_failure_is_not_hidden(self):
        self.write(self.worker, 'site/data/feed.json', 'generated data\n')

        def failing_git(args, root, check=True):
            if args[0] == 'push':
                return subprocess.CompletedProcess(args, 128, '', 'fatal: Authentication failed')
            return run_git(args, root, check)

        with self.assertRaisesRegex(RuntimeError, 'Authentication failed'):
            save_history(self.worker, git=failing_git)
        self.assertEqual(self.head(self.remote), self.base)

    def test_accepted_push_with_lost_acknowledgment_can_publish(self):
        self.write(self.worker, 'site/data/feed.json', 'generated data\n')

        def lost_ack_git(args, root, check=True):
            result = run_git(args, root, check)
            if args[0] == 'push':
                return subprocess.CompletedProcess(args, 128, '', 'fatal: connection lost')
            return result

        result = save_history(self.worker, git=lost_ack_git)
        self.assertTrue(result['publish'])
        self.assertEqual(self.head(self.remote), result['commit'])


if __name__ == '__main__':
    unittest.main()
