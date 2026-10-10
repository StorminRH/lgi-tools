"""Build the Workflow args for one wave of the primitive extraction guide.

Usage: make_args.py <N> [--base SHA] [--branch NAME] [--trailers FILE]
                        [--fallow-env 'FALLOW_TYPE_AWARE_TIMEOUT_SECS=300 '] [--kill-next]

Reads the wave's items from its guide page, its docs briefs and cautions from
kit/waves/wave-NN.json, and prints the JSON object to pass as Workflow `args`
with scriptPath docs/refactoring/kit/implement-wave.js.
"""
import argparse
import json
import os
import subprocess
import sys

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True  # keep __pycache__ out of the work tree, which every item commit adds with git add -A
sys.path.insert(0, os.path.join(KIT, 'tools'))
from wave_items import wave_items  # noqa: E402


def git(*a):
    return subprocess.check_output(['git', *a], text=True).strip()


p = argparse.ArgumentParser()
p.add_argument('wave', type=int)
p.add_argument('--base', help="commit the wave starts from (default: HEAD, so run this right after the link commit; when restarting a wave, pass the link commit's sha so the reviewers see the whole wave)")
p.add_argument('--branch', help='default: claude/primitives-wave-NN')
p.add_argument('--trailers', help='file holding the commit trailer lines (Co-Authored-By and the like)')
p.add_argument('--fallow-env', default='', help="env prefix for Fallow runs, e.g. 'FALLOW_TYPE_AWARE_TIMEOUT_SECS=300 '")
p.add_argument('--kill-next', action='store_true', help='let the environment guard stop a running next dev')
o = p.parse_args()

repo = git('rev-parse', '--show-toplevel')
w = wave_items(o.wave)
spec = json.load(open(os.path.join(KIT, 'waves', f'wave-{o.wave:02d}.json')))
common = open(os.path.join(KIT, 'waves', 'common-note.md')).read().strip()
trailers = open(o.trailers).read().strip() if o.trailers else ''


def project_note(common, spec, n):
    parts = [common, f"Wave {n} cautions: {spec['waveCautions']}"]
    if spec.get('possiblyAlreadyDone'):
        hints = ' '.join(f"{h['item']}: {h['evidence']}" for h in spec['possiblyAlreadyDone'])
        parts.append('Possibly already done, found when this wave was prepared (verify against the current tree '
                     'before changing anything, and mark the item already done with evidence if it is): ' + hints)
    return '\n\n'.join(parts)

args = {
    'wave': o.wave,
    'heading': w['heading'],
    'waveFile': w['waveFile'],
    'branch': o.branch or f'claude/primitives-wave-{o.wave:02d}',
    'base': o.base or git('rev-parse', 'HEAD'),
    'repo': repo,
    'scratch': os.path.join(git('rev-parse', '--absolute-git-dir'), 'wave-kit'),
    'trailers': trailers,
    'fallowEnv': o.fallow_env,
    'killNextDev': o.kill_next,
    'projectNote': project_note(common, spec, o.wave),
    'briefs': spec['briefs'],
    'items': w['items'],
}
print(json.dumps(args, ensure_ascii=False, indent=1))
