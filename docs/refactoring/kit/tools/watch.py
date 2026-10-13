"""Stream item outcomes from a running workflow's journal: commits, blocked items, failed checks.

Usage: watch.py <journal.jsonl> [--from-end]
"""
import json
import os
import sys
import time

path = sys.argv[1]
labels, pos = {}, 0
quiet = '--from-end' in sys.argv
while True:
    if os.path.exists(path):
        with open(path) as f:
            f.seek(pos)
            for line in f:
                if not line.endswith('\n'):
                    break
                pos += len(line.encode())
                d = json.loads(line)
                if d['type'] == 'started':
                    labels[d['key']] = d['label']
                elif d['type'] == 'result' and not quiet:
                    lab = labels.get(d['key'], '?')
                    r = d.get('result')
                    if lab.startswith(('commit:', 'review:commit', 'verify:commit')):
                        out = (r or {}).get('output', '') if isinstance(r, dict) else str(r)
                        first = next((l for l in out.splitlines() if l.strip()), '')
                        print(f'{lab} -> {first[:160]}', flush=True)
                    elif lab.startswith('impl:') and isinstance(r, dict) and r.get('status') == 'blocked':
                        print(f"{lab} status=blocked", flush=True)
                    elif ':check' in lab and isinstance(r, dict) and not r.get('passed'):
                        print(f"{lab} FAILED: {r.get('failures', '')[:200]}", flush=True)
    quiet = False
    time.sleep(5)
