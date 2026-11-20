"""Per-player, per-shot profile (median of each metric) from raw-results.json -> JSON + CSV."""
import csv, json, statistics, sys, os
raw = json.load(open(sys.argv[1])); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
profiles, rows = {}, []
for clip in raw:
    p = profiles.setdefault(clip['player'], {'player': clip['player'], 'hand': clip['hand'], 'sources': [], 'shots': {}})
    p['sources'].append({'clip': clip['clip'], 'source': clip['source'], 'license': clip['license'], 'slowmo': clip['slowmo']})
    for s in clip['strokes']:
        sh = p['shots'].setdefault(s['shot'], {'n': 0, 'values': {}, 'timing': {}, 'rulesPassed': {}})
        sh['n'] += 1
        for phase, ms in s['metrics'].items():
            for k, v in ms.items(): sh['values'].setdefault(f'{phase}.{k}', []).append(v)
        for phase, t in s['phaseTimingMs'].items(): sh['timing'].setdefault(phase, []).append(t)
        for r in s['rules']: sh['rulesPassed'].setdefault(r['rule'], []).append(r['status'] == 'good')
for p in profiles.values():
    for shot, sh in p['shots'].items():
        sh['median'] = {k: round(statistics.median(v), 3) for k, v in sh.pop('values').items()}
        sh['phaseTimingMsBeforeContact'] = {k: round(statistics.median(v)) for k, v in sh.pop('timing').items()}
        sh['rulePassRate'] = {k: round(sum(v) / len(v), 2) for k, v in sh.pop('rulesPassed').items()}
        for k, v in sh['median'].items(): rows.append([p['player'], p['hand'], shot, sh['n'], 'metric', k, v])
        for k, v in sh['phaseTimingMsBeforeContact'].items(): rows.append([p['player'], p['hand'], shot, sh['n'], 'timing_ms', k, v])
    json.dump(p, open(os.path.join(out, p['player'].lower().replace(' ', '-') + '.json'), 'w'), indent=2)
json.dump(list(profiles.values()), open(os.path.join(out, 'all-profiles.json'), 'w'), indent=2)
with open(os.path.join(out, 'all-profiles.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['player', 'hand', 'shot', 'strokes', 'kind', 'stat', 'median']); w.writerows(rows)
print(f'{len(profiles)} players, {len(rows)} rows')
