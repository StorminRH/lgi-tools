#!/usr/bin/env python3
"""Build a before/after review page for one promote from a walkthrough JSON.

Usage: build_review.py <config.json>
The config names the walkthrough JSON, the shots dir, the output dir, the page
title and intro, the section grouping, per-item overrides and extra captions.
"""
import html
import json
import os
import shutil
import sys

cfg = json.load(open(sys.argv[1]))
data = json.load(open(cfg['walkthrough']))
shots_dir = cfg['shots']
out = cfg['out']
os.makedirs(os.path.join(out, 'img'), exist_ok=True)

items = {it['id']: it for it in data['items']}
for extra in cfg.get('extra_items', []):
    items[extra['id']] = extra
captions = {p['name']: p for p in data.get('checked', {}).get('pairs', [])}
captions.update({k: {'name': k, 'caption': v, 'ok': True} for k, v in cfg.get('captions', {}).items()})
overrides = cfg.get('overrides', {})
hidden_shots = set(cfg.get('hide_shots', []))
used_files = []


def esc(s):
    return html.escape(s or '', quote=True)


def paras(s):
    parts = [p.strip() for p in (s or '').split('\n') if p.strip()]
    return ''.join(f'<p>{esc(p)}</p>' for p in parts)


def shot_block(shot):
    name = shot['name']
    if name in hidden_shots:
        return ''
    cap = captions.get(name, {}).get('caption') or shot.get('expect_difference', '')
    sides = []
    kind = None
    for side in ('before', 'after'):
        png = os.path.join(shots_dir, f'{name}-{side}.png')
        txt = os.path.join(shots_dir, f'{name}-{side}.txt')
        label = 'Before · on staging now' if side == 'before' else 'After · this promote'
        if os.path.exists(png):
            kind = 'img'
            rel = f'img/{name}-{side}.png'
            shutil.copyfile(png, os.path.join(out, rel))
            used_files.append(rel)
            sides.append(f'<figure class="side {side}"><figcaption>{label}</figcaption>'
                         f'<a href="{rel}" target="_blank" rel="noopener"><img src="{rel}" alt="{esc(label)}: {esc(name)}" loading="lazy"></a></figure>')
        elif os.path.exists(txt):
            kind = 'txt'
            sides.append(f'<figure class="side {side}"><figcaption>{label}</figcaption>'
                         f'<pre>{esc(open(txt).read().strip())}</pre></figure>')
    if not sides:
        return ''
    return (f'<div class="shot"><p class="cap">{esc(cap)}</p>'
            f'<div class="pair {kind}">{"".join(sides)}</div></div>')


def item_block(iid):
    it = dict(items[iid])
    it.update(overrides.get(iid, {}))
    shots = it.get('shots', []) + cfg.get('extra_shots', {}).get(iid, [])
    badge = 'Visible change' if it.get('user_visible') else 'No visible change'
    cls = 'vis' if it.get('user_visible') else 'quiet'
    note = f'<div class="note"><strong>Settled:</strong> {esc(it["settled"])}</div>' if it.get('settled') else ''
    if it.get('owner_question'):
        note += f'<div class="note ask"><strong>Question for you:</strong> {paras(it["owner_question"])}</div>'
    risk = f'<details><summary>Risks and limits</summary>{paras(it.get("risk_notes"))}</details>' if it.get('risk_notes') else ''
    behind = f'<details><summary>Behind the scenes</summary>{paras(it.get("behind_the_scenes"))}</details>' if it.get('behind_the_scenes') else ''
    shot_html = ''.join(shot_block(s) for s in shots)
    return f'''<article class="item {cls}" id="{esc(slug(iid))}">
  <header><span class="pid">{esc(iid)}</span><span class="badge {cls}">{badge}</span></header>
  <h3>{esc(it['title'])}</h3>
  <p class="where"><span>Where you meet it</span>{esc(it.get('where_users_meet_it'))}</p>
  {note}
  <div class="ba"><section><h4>Before</h4>{paras(it.get('before'))}</section><section><h4>After</h4>{paras(it.get('after'))}</section></div>
  {shot_html}
  {risk}{behind}
</article>'''


def slug(s):
    return ''.join(c.lower() if c.isalnum() else '-' for c in s).strip('-')


sections_html = []
toc = []
for sec in cfg['sections']:
    present = [i for i in sec['items'] if i in items]
    if not present:
        continue
    toc.append(f'<li><a href="#{slug(sec["title"])}">{esc(sec["title"])}</a> <span>{len(present)}</span></li>')
    rows = ''.join(item_block(i) for i in present)
    sections_html.append(f'<section class="area" id="{slug(sec["title"])}"><h2>{esc(sec["title"])}</h2>'
                         f'<p class="lede">{esc(sec.get("lede", ""))}</p>{rows}</section>')

summary_rows = ''.join(
    f'<tr><td><a href="#{slug(i)}">{esc(i)}</a></td><td>{esc((overrides.get(i, {}).get("title")) or items[i]["title"])}</td>'
    f'<td class="{"yes" if items[i].get("user_visible") else "no"}">{"Yes" if items[i].get("user_visible") else "No"}</td></tr>'
    for sec in cfg['sections'] for i in sec['items'] if i in items)

page = open(os.path.join(os.path.dirname(__file__), 'review_template.html')).read()
page = (page.replace('{{TITLE}}', esc(cfg['title']))
        .replace('{{EYEBROW}}', esc(cfg.get('eyebrow', '')))
        .replace('{{INTRO}}', cfg['intro_html'])
        .replace('{{STATUS}}', cfg['status_html'])
        .replace('{{TOC}}', ''.join(toc))
        .replace('{{SUMMARY_ROWS}}', summary_rows)
        .replace('{{SECTIONS}}', ''.join(sections_html))
        .replace('{{NEXT}}', cfg['next_html']))
open(os.path.join(out, 'index.html'), 'w').write(page)
json.dump(used_files, open(os.path.join(out, 'files.json'), 'w'))
print(f'wrote {out}/index.html with {len(used_files)} images')
