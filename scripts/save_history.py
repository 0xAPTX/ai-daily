"""Fast-forward public feed history; never publish an outdated checkout."""
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PATHS = ['site/index.html', 'site/data', 'site/feed.xml', 'site/sources.opml',
         'x-watchlist.json', 'imports/0xaptx-following.json']


def run_git(args, root, check=True):
    result = subprocess.run(['git', *args], cwd=root, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError('git ' + args[0] + ' failed: ' + result.stderr.strip())
    return result


def save_history(root=ROOT, git=run_git):
    def head(ref='HEAD'):
        return git(['rev-parse', ref], root).stdout.strip()

    def remote_head():
        git(['fetch', '--no-tags', 'origin', 'main'], root)
        return head('FETCH_HEAD')

    def outdated():
        return {'publish': False, 'commit': head(),
                'reason': 'main advanced while this run was queued or collecting; newer changes were preserved.'}

    base = head()
    if remote_head() != base:
        return outdated()
    git(['add', '--', *PATHS], root)
    changes = git(['diff', '--cached', '--quiet'], root, check=False)
    if changes.returncode not in (0, 1):
        raise RuntimeError('Could not check generated history changes: ' + changes.stderr.strip())
    if changes.returncode:
        git(['commit', '-m', 'Refresh public AI sources'], root)
        expected = head()
        pushed = git(['push', 'origin', 'HEAD:refs/heads/main'], root, check=False)
        if pushed.returncode:
            current = remote_head()
            if current != expected:
                message = (pushed.stdout + pushed.stderr).lower()
                conflict = '[rejected]' in message and ('fetch first' in message or 'non-fast-forward' in message)
                if conflict and current != base:
                    return outdated()
                # Do not turn authentication/network failures into a successful skip.
                raise RuntimeError('git push failed: ' + pushed.stderr.strip())
            # A lost network acknowledgment may still have accepted our exact commit.
    expected = head()
    if remote_head() != expected:
        return outdated()
    return {'publish': True, 'commit': expected, 'reason': 'Generated history matches main and is ready to publish.'}


def main():
    result = save_history()
    output = os.environ.get('GITHUB_OUTPUT')
    if output:
        with open(output, 'a') as stream:
            stream.write('publish=' + str(result['publish']).lower() + '\n')
            stream.write('commit=' + result['commit'] + '\n')
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as stream:
            stream.write('### Public news history\n\n' + result['reason'] + '\n')
    if not result['publish']:
        print('::notice title=Newer main preserved::' + result['reason'])
    print(result['reason'])


if __name__ == '__main__':
    main()
