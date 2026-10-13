"""Tick a guide item's status line and roadmap box.

Usage: mark.py <ID> <done|upstream|blocked> [note | @notefile]
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # docs/refactoring
item, state = sys.argv[1].upper(), sys.argv[2]
note = ' '.join(sys.argv[3:]).strip()
if note.startswith('@'):
    note = open(note[1:]).read().strip()
note = note.replace('\n', ' ')
status = {'done': '[x] done', 'upstream': '[x] already done (see commit)', 'blocked': f'[ ] blocked: {note}'}[state]
box = {'done': '☑', 'upstream': '☑', 'blocked': '⚠'}[state]
anchor = f'<a id="{item.lower()}"></a>'
hit = False
for f in sorted(os.listdir(ROOT)):
    p = os.path.join(ROOT, f)
    if not f.endswith('.md') or not os.path.isfile(p):
        continue
    t = open(p).read()
    orig = t
    if anchor in t:
        i = t.index(anchor)
        j = t.index('- **Status:**', i)
        k = t.index('\n', j)
        t = t[:j] + f'- **Status:** {status}' + t[k:]
        hit = True
    t = re.sub(r'^\| [☐☑⚠] \| (\[' + item + r'\]\()', lambda m: f'| {box} | {m.group(1)}', t, flags=re.M)
    if t != orig:
        open(p, 'w').write(t)
if not hit:
    sys.exit(f'item {item} not found')
print(f'{item}: {status}')
