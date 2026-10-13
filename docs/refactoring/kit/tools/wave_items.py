"""Print a wave's heading, guide file and items (id, title, dependsOn, status) as JSON.

Usage: wave_items.py <N>
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # docs/refactoring


def wave_items(n):
    f = [x for x in sorted(os.listdir(ROOT)) if x.startswith(f'wave-{n:02d}-')][0]
    t = open(os.path.join(ROOT, f)).read()
    heading = t.splitlines()[0].lstrip('# ').strip()
    items = []
    for m in re.finditer(r'^## (P\d{3}): (.+)$', t, re.M):
        rest = t[m.end():]
        sec = rest[:rest.find('\n## P')] if '\n## P' in rest else rest
        dep = re.search(r'\*\*Depends on:\*\* (.+)', sec)
        deps = re.findall(r'\[(P\d{3})\]', dep.group(1)) if dep else []
        status = re.search(r'\*\*Status:\*\* (.+)', sec).group(1)
        items.append({'id': m.group(1), 'title': m.group(2).strip(), 'dependsOn': deps, 'status': status})
    return {'wave': n, 'heading': heading, 'waveFile': f, 'items': items}


if __name__ == '__main__':
    print(json.dumps(wave_items(int(sys.argv[1])), ensure_ascii=False))
